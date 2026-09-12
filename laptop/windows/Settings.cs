using System;
using System.IO;
using System.Text.Json;
namespace LaptopSolo;
public sealed class Settings
{
    public double Neutral { get; set; } = 110;
    public double ManualAngle { get; set; } = 110;
    public double Strength { get; set; } = 1;
    public bool Automatic { get; set; } = true;
    public bool Everyday { get; set; } = false;
    public string Monitor { get; set; } = "";
    static string PathName => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "LaptopSolo", "settings.json");
    public static Settings Load()
    {
        try {
            var s = JsonSerializer.Deserialize<Settings>(File.ReadAllText(PathName)) ?? new();
            s.Neutral = double.IsFinite(s.Neutral) ? Math.Clamp(s.Neutral, 20, 160) : 110;
            s.ManualAngle = double.IsFinite(s.ManualAngle) ? Math.Clamp(s.ManualAngle, 0, 180) : 110;
            s.Strength = double.IsFinite(s.Strength) ? Math.Clamp(s.Strength, 0, 1.5) : 1;
            return s;
        } catch { return new(); }
    }
    public void Save()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(PathName)!);
        File.WriteAllText(PathName + ".tmp", JsonSerializer.Serialize(this));
        File.Move(PathName + ".tmp", PathName, true);
    }
}
