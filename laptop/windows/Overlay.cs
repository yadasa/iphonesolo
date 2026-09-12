using System;
using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Effects;
using System.Windows.Media.Imaging;
using System.Windows.Media.Media3D;
using Forms = System.Windows.Forms;
using Drawing = System.Drawing;
namespace LaptopSolo;
internal sealed class Overlay : Window
{
    readonly Grid root = new();
    readonly Viewport3D view = new();
    readonly MeshGeometry3D mesh = new();
    readonly ImageBrush texture = new();
    readonly LinearGradientBrush shade = new(Colors.Transparent, Colors.Black, new Point(0,1), new Point(0,0));
    readonly Border tint = new();
    readonly BlurEffect blur = new() { RenderingBias = RenderingBias.Performance };
    readonly Forms.Screen screen;
    Drawing.Bitmap? capture;
    Drawing.Graphics? graphics;
    readonly bool live;
    IntPtr handle;
    public Overlay(Forms.Screen screen, bool live, Action exitLive)
    {
        this.screen=screen; this.live=live;
        WindowStyle=WindowStyle.None; ResizeMode=ResizeMode.NoResize; ShowInTaskbar=false;
        AllowsTransparency=true; Background=Brushes.Transparent; Topmost=true; ShowActivated=false;
        Content=root;
        if (live)
        {
            root.Background=Brushes.Black;
            var drawing = new DrawingGroup();
            drawing.Children.Add(new GeometryDrawing(texture, null, new RectangleGeometry(new Rect(0,0,1,1))));
            drawing.Children.Add(new GeometryDrawing(shade, null, new RectangleGeometry(new Rect(0,0,1,1))));
            var material=new EmissiveMaterial(new DrawingBrush(drawing));
            view.Camera=new OrthographicCamera(new Point3D(0,0,5),new Vector3D(0,0,-1),new Vector3D(0,1,0),2);
            var model=new GeometryModel3D(mesh,material) { BackMaterial=material };
            view.Children.Add(new ModelVisual3D { Content=model });
            view.Effect=blur;
            for(int i=0;i<=128;i++) { double d=i/128.0; mesh.TextureCoordinates.Add(new Point(0,1-d)); mesh.TextureCoordinates.Add(new Point(1,1-d)); }
            for(int i=0;i<128;i++){int a=i*2; foreach(int v in new[]{a,a+1,a+2,a+2,a+1,a+3}) mesh.TriangleIndices.Add(v);}
            root.Children.Add(view);
            var hint=new TextBlock { Text="LIVE FOLD · Click to return to your desktop · Ctrl+Alt+Esc to pause",Foreground=Brushes.White,Background=new SolidColorBrush(Color.FromArgb(160,0,0,0)),Padding=new Thickness(14),HorizontalAlignment=HorizontalAlignment.Center,VerticalAlignment=VerticalAlignment.Bottom,Margin=new Thickness(20),IsHitTestVisible=false };
            root.Children.Add(hint);
            PreviewMouseDown += (_,e)=>{e.Handled=true;exitLive();};
            PreviewMouseWheel += (_,e)=>{e.Handled=true;exitLive();};
        }
        else { tint.Background=shade;root.Children.Add(tint); }
        SourceInitialized += (_,_)=>
        {
            handle=new WindowInteropHelper(this).Handle;
            if (!Native.SetWindowDisplayAffinity(handle,0x11) && live)
                throw new Win32Exception("Windows cannot exclude the overlay from capture. Live fold is unavailable.");
            long style=Native.GetWindowLongPtr(handle,-20).ToInt64() | 0x08000000 | 0x80;
            if(!live) style |= 0x20;
            Native.SetWindowLongPtr(handle,-20,new IntPtr(style));
        };
        Loaded += (_,_)=> { var b=screen.Bounds; Native.SetWindowPos(handle,new IntPtr(-1),b.X,b.Y,b.Width,b.Height,0x10); };
        Closed += (_,_)=>{graphics?.Dispose();capture?.Dispose();texture.ImageSource=null;};
    }
    public void Update(double amount)
    {
        // Everyday mode is click-through and does not capture the desktop.
        if(!live){ shade.Opacity=Math.Min(.45,amount*.65); return; }
        var bounds=screen.Bounds;
        // Bound allocation/capture to the chosen screen; reuse GDI objects each frame.
        capture ??= new Drawing.Bitmap(bounds.Width,bounds.Height,Drawing.Imaging.PixelFormat.Format32bppPArgb);
        graphics ??= Drawing.Graphics.FromImage(capture);
        graphics.CopyFromScreen(bounds.X,bounds.Y,0,0,bounds.Size,Drawing.CopyPixelOperation.SourceCopy);
        IntPtr bitmap=capture.GetHbitmap();
        try {
            var source=Imaging.CreateBitmapSourceFromHBitmap(bitmap,IntPtr.Zero,Int32Rect.Empty,BitmapSizeOptions.FromWidthAndHeight(Math.Min(1920,bounds.Width),Math.Max(1,(int)(bounds.Height*Math.Min(1,1920.0/bounds.Width)))));
            source.Freeze(); texture.ImageSource=source;
        } finally { Native.DeleteObject(bitmap); }
        var positions=new Point3DCollection();
        double aspect=(double)bounds.Width/bounds.Height;
        for(int i=0;i<=128;i++) foreach(double x in new[]{-1.0,1.0}) {
            var p=HingeMath.Point(x,i/128.0*2-1,amount);positions.Add(new Point3D(p.X,p.Y/aspect,0));
        }
        mesh.Positions=positions;
        // Native Gaussian blur approximates the browser's distance-varying kernel.
        blur.Radius=amount*6;shade.Opacity=Math.Min(.83,amount*1.3);
    }
}
