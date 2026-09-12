using LaptopSolo;
static void Check(bool ok,string message){if(!ok)throw new Exception(message);}
Check(HingeMath.Amount(110,110,1)==0,"Neutral must be flat");
Check(HingeMath.Amount(65,110,1)==.5,"Closing calibration");
Check(HingeMath.Amount(155,110,1)==.5,"Opening calibration");
Check(HingeMath.Amount(double.NaN,110,1)==0,"Invalid reading");
foreach(var amount in new[]{0,.25,.5,.75,1}) {
    Check(HingeMath.Point(-1,-1,amount)==(-1,-1),"Left hinge anchor");
    Check(HingeMath.Point(1,-1,amount)==(1,-1),"Right hinge anchor");
    double previous=-2;
    for(int i=0;i<=128;i++){
        var p=HingeMath.Point(1,i/64.0-1,amount);
        Check(double.IsFinite(p.X)&&double.IsFinite(p.Y)&&p.Y>=previous,"No inverted mesh rows");previous=p.Y;
    }
}
Console.WriteLine("Native hinge geometry checks passed.");
