using System;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Win32;
using Windows.Devices.Sensors;
using Forms = System.Windows.Forms;
namespace LaptopSolo;
internal sealed class App : Application
{
    readonly Settings settings=Settings.Load();
    readonly DispatcherTimer timer=new() { Interval=TimeSpan.FromMilliseconds(50) };
    readonly DispatcherTimer saveTimer=new() { Interval=TimeSpan.FromMilliseconds(400) };
    readonly Stopwatch clock=Stopwatch.StartNew();
    Window controls=null!;
    TextBlock status=null!,readout=null!;
    Slider angle=null!;
    ComboBox monitors=null!;
    CheckBox automatic=null!,everyday=null!;
    Forms.NotifyIcon tray=null!;
    Overlay? overlay;
    HingeAngleSensor? sensor;
    bool live,paused,locked,busy,exiting,probing;
    double smoothed=110,lastTime;
    long lastReading;
    string sensorMessage="Checking for a hinge sensor…";
    IntPtr handle;
    HwndSource? source;
    const string StartupKey=@"Software\Microsoft\Windows\CurrentVersion\Run";
    [STAThread] public static void Main(string[] args)
    {
        using var mutex=new Mutex(true,@"Local\LaptopSolo",out bool created);
        if(!created){ MessageBox.Show("Laptop Solo is already running. Open it from the system tray.");return; }
        var app=new App();
        app.Startup += (_,_)=>{
            app.Start(args.Contains("--tray") || args.Contains("--smoke-test"));
            if(args.Contains("--smoke-test")) {
                var smoke=new DispatcherTimer { Interval=TimeSpan.FromSeconds(2) };
                smoke.Tick+=(_,_)=>{smoke.Stop();app.Quit();};smoke.Start();
            }
        };
        app.Run();
    }
    void Start(bool hidden)
    {
        ShutdownMode=ShutdownMode.OnExplicitShutdown;
        BuildControls();
        tray=new Forms.NotifyIcon { Icon=System.Drawing.SystemIcons.Application,Text="Laptop Solo",Visible=true };
        var menu=new Forms.ContextMenuStrip();
        menu.Items.Add("Open controls",null,(_,_)=>Dispatcher.Invoke(ShowControls));
        menu.Items.Add("Pause / resume",null,(_,_)=>Dispatcher.Invoke(TogglePause));
        menu.Items.Add("Live fold",null,(_,_)=>Dispatcher.Invoke(StartLive));
        menu.Items.Add("Quit",null,(_,_)=>Dispatcher.Invoke(Quit));
        tray.ContextMenuStrip=menu;tray.DoubleClick+=(_,_)=>Dispatcher.Invoke(ShowControls);
        handle=new WindowInteropHelper(controls).EnsureHandle();
        source=HwndSource.FromHwnd(handle);source.AddHook(WindowMessage);
        bool escape=Native.RegisterHotKey(handle,1,0x4003,0x1B); // Ctrl+Alt+Esc, no repeat
        bool fold=Native.RegisterHotKey(handle,2,0x4003,0x4C); // Ctrl+Alt+L
        Native.SetWindowDisplayAffinity(handle,0x11);
        if(!escape || !fold) status.Text="A shortcut is already in use. Use the tray menu or click the live fold to exit.";
        timer.Tick+=Tick;timer.Start();
        saveTimer.Tick+=(_,_)=>{saveTimer.Stop();Save();};
        SystemEvents.SessionSwitch+=SessionChanged;SystemEvents.PowerModeChanged+=PowerChanged;SystemEvents.DisplaySettingsChanged+=DisplaysChanged;
        if(!hidden)controls.Show();
        _=ProbeSensor();
        RebuildOverlay();
    }
    void BuildControls()
    {
        controls=new Window { Title="Laptop Solo",Width=500,Height=670,MinWidth=420,MinHeight=500,Background=new SolidColorBrush(Color.FromRgb(13,17,25)),Foreground=Brushes.White,WindowStartupLocation=WindowStartupLocation.CenterScreen };
        var body=new StackPanel { Margin=new Thickness(28) };
        controls.Content=new ScrollViewer { Content=body,VerticalScrollBarVisibility=ScrollBarVisibility.Auto };
        body.Children.Add(new TextBlock { Text="Laptop Solo",FontSize=32,Margin=new Thickness(0,0,0,12) });
        body.Children.Add(Text("Hinge-driven depth on your real desktop. Close this window to keep it running in the tray."));
        status=Text("Starting…");body.Children.Add(status);
        automatic=new CheckBox { Content="Use hardware hinge angle when available",IsChecked=settings.Automatic,Margin=new Thickness(0,15,0,10),Foreground=Brushes.White };
        automatic.Click+=(_,_)=>{settings.Automatic=automatic.IsChecked==true;Changed();};body.Children.Add(automatic);
        readout=Text("");body.Children.Add(readout);
        angle=new Slider { Minimum=0,Maximum=180,Value=settings.ManualAngle,TickFrequency=1,IsSnapToTickEnabled=true,Margin=new Thickness(0,5,0,12) };
        angle.ValueChanged+=(_,_)=>{settings.ManualAngle=angle.Value;Changed();};body.Children.Add(angle);
        body.Children.Add(Button("Set current angle as neutral",()=>{settings.Neutral=Math.Clamp(smoothed,20,160);Changed();}));
        body.Children.Add(Text("Effect strength"));
        var strength=new Slider { Minimum=0,Maximum=1.5,Value=settings.Strength,Margin=new Thickness(0,6,0,10) };
        strength.ValueChanged+=(_,_)=>{settings.Strength=strength.Value;Changed();};body.Children.Add(strength);
        body.Children.Add(Text("Display (choose your built-in laptop panel)"));
        monitors=new ComboBox { Margin=new Thickness(0,8,0,12) };RefreshMonitors();
        monitors.SelectionChanged+=(_,_)=>{if(monitors.SelectedItem is string name){settings.Monitor=name;Changed();RebuildOverlay();}};body.Children.Add(monitors);
        everyday=new CheckBox { Content="Everyday shading · keeps clicks aligned",IsChecked=settings.Everyday,Foreground=Brushes.White,Margin=new Thickness(0,6,0,10) };
        everyday.Click+=(_,_)=>{settings.Everyday=everyday.IsChecked==true;paused=false;Changed();RebuildOverlay();};body.Children.Add(everyday);
        body.Children.Add(Button("Start live desktop fold  ·  Ctrl+Alt+L",StartLive));
        body.Children.Add(Text("Live fold is visual only. Click once to dismiss it before using your apps. Ctrl+Alt+Esc pauses all effects."));
        var startup=new CheckBox { Content="Launch in tray when I sign in",IsChecked=StartupEnabled(),Foreground=Brushes.White,Margin=new Thickness(0,15,0,10) };
        startup.Click+=(_,_)=>{try{SetStartup(startup.IsChecked==true);}catch(Exception e){startup.IsChecked=StartupEnabled();status.Text=e.Message;}};body.Children.Add(startup);
        body.Children.Add(Button("Retry hinge sensor",()=>_=ProbeSensor()));
        body.Children.Add(Button("Pause / resume",TogglePause));body.Children.Add(Button("Quit Laptop Solo",Quit));
        controls.Closing+=(_,e)=>{if(!exiting){e.Cancel=true;controls.Hide();Save();}};
    }
    static TextBlock Text(string text)=>new(){Text=text,TextWrapping=TextWrapping.Wrap,Foreground=new SolidColorBrush(Color.FromRgb(173,187,211)),Margin=new Thickness(0,5,0,5)};
    static Button Button(string text,Action action){var b=new Button { Content=text,Padding=new Thickness(12,8,12,8),Margin=new Thickness(0,4,0,4) };b.Click+=(_,_)=>action();return b;}
    void RefreshMonitors()
    {
        var names=Forms.Screen.AllScreens.Select(s=>s.DeviceName).ToArray();monitors.ItemsSource=names;
        monitors.SelectedItem=names.Contains(settings.Monitor)?settings.Monitor:Forms.Screen.PrimaryScreen?.DeviceName??names.First();
    }
    Forms.Screen SelectedScreen()=>Forms.Screen.AllScreens.FirstOrDefault(s=>s.DeviceName==settings.Monitor)??Forms.Screen.PrimaryScreen??Forms.Screen.AllScreens[0];
    async Task ProbeSensor()
    {
        if(probing)return;probing=true;
        try { sensor=await HingeAngleSensor.GetDefaultAsync();sensorMessage=sensor==null?"No supported hinge sensor found · manual angle enabled.":"Hardware hinge sensor connected."; }
        catch(Exception e){sensor=null;sensorMessage="Hinge sensor unavailable · manual angle enabled. "+e.Message;}
        finally {probing=false;}
        status.Text=sensorMessage;
    }
    async void Tick(object? sender,EventArgs args)
    {
        if(busy||locked||exiting)return;busy=true;
        try
        {
            double target=settings.ManualAngle;
            if(settings.Automatic&&sensor!=null)
            {
                if(clock.ElapsedMilliseconds-lastReading>=100)
                {
                    lastReading=clock.ElapsedMilliseconds;
                    try {
                        var reading=await sensor.GetCurrentReadingAsync();
                        if(reading==null || !double.IsFinite(reading.AngleInDegrees)) throw new InvalidOperationException("No valid reading.");
                        hardwareAngle=Math.Clamp(reading.AngleInDegrees,0,180);
                    }catch{sensor=null;sensorMessage="Hinge sensor disconnected · manual angle enabled.";status.Text=sensorMessage;}
                }
                if(sensor!=null)target=hardwareAngle;
            }
            double now=clock.Elapsed.TotalMilliseconds,dt=Math.Clamp(now-lastTime,0,100);lastTime=now;
            smoothed+=(target-smoothed)*(1-Math.Exp(-dt/95));
            bool hardware=settings.Automatic&&sensor!=null;
            angle.IsEnabled=!hardware;
            readout.Text=$"{(hardware?"Sensor":"Manual")}: {smoothed:F0}°   ·   Neutral: {settings.Neutral:F0}°";
            if(locked||exiting||paused)return;
            if(overlay!=null) overlay.Update(HingeMath.Amount(smoothed,settings.Neutral,settings.Strength));
        }
        catch(Exception e){StopOverlay();live=false;paused=true;status.Text="Effect paused: "+e.Message;}
        finally{busy=false;}
    }
    double hardwareAngle=110;
    void Changed(){saveTimer.Stop();saveTimer.Start();}
    void Save(){try{settings.Save();}catch(Exception e){status.Text="Could not save settings: "+e.Message;}}
    void StartLive(){if(locked)return;if(live){EndLive();return;}paused=false;live=true;controls.Hide();RebuildOverlay();}
    void EndLive(){live=false;RebuildOverlay();}
    void TogglePause(){paused=!paused;live=false;RebuildOverlay();status.Text=paused?"All effects paused.":sensorMessage;}
    void StopOverlay(){overlay?.Close();overlay=null;}
    void RebuildOverlay()
    {
        StopOverlay();
        if(paused||locked||exiting||(!live&&!settings.Everyday))return;
        try{overlay=new Overlay(SelectedScreen(),live,EndLive);overlay.Show();overlay.Update(HingeMath.Amount(smoothed,settings.Neutral,settings.Strength));}
        catch(Exception e){StopOverlay();live=false;paused=true;status.Text="Effect unavailable: "+e.Message;controls.Show();}
    }
    void ShowControls(){EndLive();controls.Show();controls.Activate();}
    IntPtr WindowMessage(IntPtr hwnd,int msg,IntPtr w,IntPtr l,ref bool handled)
    {
        if(msg==0x0312){if(w.ToInt32()==1){paused=true;live=false;RebuildOverlay();status.Text="All effects paused.";}else if(w.ToInt32()==2)StartLive();handled=true;}
        return IntPtr.Zero;
    }
    void SessionChanged(object sender,SessionSwitchEventArgs e)=>Dispatcher.BeginInvoke(new Action(()=>{locked=e.Reason==SessionSwitchReason.SessionLock || (locked&&e.Reason!=SessionSwitchReason.SessionUnlock);live=false;RebuildOverlay();}));
    void PowerChanged(object sender,PowerModeChangedEventArgs e)=>Dispatcher.BeginInvoke(new Action(()=>{if(e.Mode==PowerModes.Suspend){locked=true;live=false;StopOverlay();}else if(e.Mode==PowerModes.Resume){locked=false;_=ProbeSensor();RebuildOverlay();}}));
    void DisplaysChanged(object? sender,EventArgs e)=>Dispatcher.BeginInvoke(new Action(()=>{live=false;StopOverlay();RefreshMonitors();RebuildOverlay();}));
    static bool StartupEnabled(){using var key=Registry.CurrentUser.OpenSubKey(StartupKey);return key?.GetValue("LaptopSolo") is string;}
    static void SetStartup(bool enabled)
    {
        using var key=Registry.CurrentUser.CreateSubKey(StartupKey);
        if(enabled)key.SetValue("LaptopSolo",$"\"{Environment.ProcessPath}\" --tray");else key.DeleteValue("LaptopSolo",false);
    }
    void Quit()
    {
        if(exiting)return;exiting=true;timer.Stop();saveTimer.Stop();Save();StopOverlay();
        SystemEvents.SessionSwitch-=SessionChanged;SystemEvents.PowerModeChanged-=PowerChanged;SystemEvents.DisplaySettingsChanged-=DisplaysChanged;
        Native.UnregisterHotKey(handle,1);Native.UnregisterHotKey(handle,2);source?.RemoveHook(WindowMessage);
        tray.Visible=false;tray.Dispose();controls.Close();Shutdown();
    }
}
