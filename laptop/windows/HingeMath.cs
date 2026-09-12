using System;
namespace LaptopSolo;
public static class HingeMath
{
    public static double Amount(double angle, double neutral, double strength)
    {
        if (!double.IsFinite(angle) || !double.IsFinite(neutral) || !double.IsFinite(strength)) return 0;
        return Math.Clamp(Math.Abs(Math.Clamp(angle, 0, 180) - Math.Clamp(neutral, 20, 160)) / 90 * Math.Clamp(strength, 0, 1.5), 0, 1);
    }
    public static (double X, double Y) Point(double x, double y, double amount)
    {
        double d = Math.Clamp((y + 1) / 2, 0, 1), ramp = Math.Pow(d * d * (3 - 2 * d), 1.03);
        return (x * (1 + .55 * amount * ramp), -1 + (y + 1) / (1 + 2.57 * amount * d));
    }
}
