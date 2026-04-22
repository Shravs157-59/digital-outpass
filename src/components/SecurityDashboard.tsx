/**
 * SecurityDashboard.tsx
 * 
 * TYPESCRIPT CONCEPTS IN THIS FILE:
 * 
 * 1. NESTED INTERFACES — LogEntry has outpass_requests which itself has a student object.
 *    This is how you describe deeply nested API response shapes.
 * 
 * 2. LITERAL UNION TYPES — usageType?: 'entry' | 'exit'
 *    Can ONLY be one of these exact string values.
 * 
 * 3. OPTIONAL CHAINING used with "?" in types and in code (e.g., data?.student?.full_name)
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, QrCode, LogOut, User, Clock, CheckCircle, XCircle, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { qrCodeSchema } from "@/lib/schemas";
import QRScanner from "./QRScanner";

/** Deeply nested interface — models the security log entry with related outpass data */
interface LogEntry {
  id: string;
  request_id: string;
  security_id: string;
  action: string;
  verified_at: string;
  notes?: string;
  outpass_requests?: {      // Optional nested object from a database JOIN
    id: string;
    purpose: string;
    from_date: string;
    to_date: string;
    student?: {             // Another level of nesting (student inside outpass)
      full_name: string;
      reg_no: string;
    };
  };
}

/**
 * ScanResult — represents the verification response from the backend.
 * Almost all fields are optional ("?") because the response varies
 * based on whether the outpass is valid or not.
 */
interface ScanResult {
  valid: boolean;           // Only required field — was verification successful?
  outpassId?: string;
  studentName?: string;
  regNo?: string;
  year?: string;
  department?: string;
  validFrom?: string;
  validTo?: string;
  reason?: string;
  status?: string;
  alreadyUsed?: boolean;
  usageType?: 'entry' | 'exit';  // LITERAL UNION: can only be 'entry' or 'exit'
  error?: string;
  details?: string;
}

interface SecurityDashboardProps {
  userData: any;
  onLogout: () => void;
}

export default function SecurityDashboard({ userData, onLogout }: SecurityDashboardProps) {
  const [qrInput, setQrInput] = useState("");
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    todayOut: 0,
    todayIn: 0,
    currentlyOut: 0,
    totalToday: 0
  });
  const { toast } = useToast();

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('security_logs')
        .select(`
          *,
          outpass_requests!security_logs_request_id_fkey (
            id,
            purpose,
            from_date,
            to_date,
            student:profiles!outpass_requests_student_id_fkey (
              full_name,
              reg_no
            )
          )
        `)
        .order('verified_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setLogs(data as any || []);

      // Calculate stats
      const today = new Date().toISOString().split('T')[0];
      const todayLogs = (data || []).filter((log: LogEntry) => 
        log.verified_at.startsWith(today)
      );

      setStats({
        todayOut: todayLogs.filter(log => log.action === 'exit').length,
        todayIn: todayLogs.filter(log => log.action === 'entry').length,
        currentlyOut: (data || []).reduce((acc, log) => {
          if (log.action === 'exit') acc++;
          if (log.action === 'entry') acc--;
          return acc;
        }, 0),
        totalToday: todayLogs.length
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Unable to load logs. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('security-logs')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'security_logs'
        },
        (payload) => {
          console.log('Realtime update:', payload);
          fetchLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleQRScan = async () => {
    const normalizedInput = qrInput.trim();
    const validation = qrCodeSchema.safeParse(normalizedInput);
    if (!validation.success) {
      toast({
        title: "Invalid UUID",
        description: "Please enter a valid Outpass UUID",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('verify-outpass', {
        body: { uuid: validation.data },
      });

      if (error) {
        throw new Error(error.message || "Could not verify the outpass");
      }

      if (!data) {
        throw new Error("Empty verification response");
      }

      setScanResult(data as ScanResult);

      if (!data.valid) {
        toast({
          title: data.status ? "⚠️ Outpass Not Approved" : "❌ Invalid UUID",
          description: data.details || data.error || "Verification failed",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Could not verify the outpass. Please try again.",
        variant: "destructive",
      });
    }
  };

  const markEntry = async (action: "exit" | "entry") => {
    if (!scanResult || !scanResult.valid) return;

    try {
      const { error } = await supabase
        .from('security_logs')
        .insert({
          request_id: scanResult.outpassId,
          security_id: userData.id,
          action: action,
          notes: `${action === 'exit' ? 'Exit' : 'Entry'} recorded at main gate`
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: `${action === 'exit' ? 'Exit' : 'Entry'} recorded successfully`
      });

      setScanResult(null);
      setQrInput("");
      fetchLogs();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-glow/5 via-background to-primary/10">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <Shield className="w-8 h-8 text-primary-glow" />
              <div>
                <h1 className="text-xl font-semibold">Security Dashboard</h1>
                <p className="text-muted-foreground text-sm">Campus Entry/Exit Management</p>
              </div>
            </div>
            <Button variant="outline" onClick={onLogout}>
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Today's Exits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{stats.todayOut}</div>
              <p className="text-xs text-muted-foreground mt-2">Students went out</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Today's Returns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{stats.todayIn}</div>
              <p className="text-xs text-muted-foreground mt-2">Students returned</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Currently Out</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{stats.currentlyOut}</div>
              <p className="text-xs text-muted-foreground mt-2">Yet to return</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Activities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-accent">{stats.totalToday}</div>
              <p className="text-xs text-muted-foreground mt-2">Today's entries</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="scanner" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="scanner">QR Scanner</TabsTrigger>
            <TabsTrigger value="logs">Entry/Exit Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="scanner" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* QR Scanner */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <QrCode className="w-5 h-5" />
                    <span>QR Code Scanner</span>
                  </CardTitle>
                  <CardDescription>
                    Scan student outpass QR codes to verify and log entry/exit
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="qrInput">Outpass ID</Label>
                    <Input
                      id="qrInput"
                      placeholder="Enter Outpass ID (UUID)"
                      value={qrInput}
                      onChange={(e) => setQrInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleQRScan()}
                    />
                  </div>
                  
                  <Button onClick={handleQRScan} className="w-full" size="lg">
                    <Search className="w-4 h-4 mr-2" />
                    Verify Outpass
                  </Button>
                  
                  <div className="bg-muted/50 rounded-lg p-4 text-center text-sm text-muted-foreground">
                    📱 In production, this would use camera for QR scanning
                  </div>
                </CardContent>
              </Card>

              {/* Scan Result */}
              <Card>
                <CardHeader>
                  <CardTitle>Verification Result</CardTitle>
                </CardHeader>
                <CardContent>
                  {!scanResult ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <QrCode className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Scan a QR code to see verification results</p>
                    </div>
                  ) : scanResult.valid ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-success/10 border border-success/20 rounded-md mb-4">
                        <div className="flex items-center space-x-2 text-success mb-2">
                          <CheckCircle className="w-5 h-5" />
                          <span className="font-semibold">Valid Outpass</span>
                        </div>
                        <p className="text-sm font-medium text-success">
                          {scanResult.usageType === 'exit' 
                            ? '✓ Ready for Exit' 
                            : '✓ Ready for Entry (Return)'}
                        </p>
                        {scanResult.alreadyUsed && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Student has exited and is now returning to campus
                          </p>
                        )}
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">Outpass UUID</p>
                          <p className="font-mono text-xs">{scanResult.outpassId}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Student Name</p>
                          <p className="font-medium">{scanResult.studentName}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Registration Number</p>
                          <p className="font-medium">{scanResult.regNo}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Year</p>
                          <p className="font-medium">{scanResult.year}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Department</p>
                          <p className="font-medium">{scanResult.department}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Purpose</p>
                          <p>{scanResult.reason}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Valid Period</p>
                          <p className="text-xs">{new Date(scanResult.validFrom).toLocaleString()} to {new Date(scanResult.validTo).toLocaleString()}</p>
                        </div>
                        <Badge className="bg-success text-success-foreground">{scanResult.status.toUpperCase()}</Badge>
                      </div>
                      
                      <div className="flex space-x-2 pt-4">
                        {scanResult.usageType === 'exit' ? (
                          <Button 
                            variant="default"
                            onClick={() => markEntry("exit")}
                            className="flex-1 bg-success hover:bg-success/90"
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Record Exit
                          </Button>
                        ) : (
                          <Button 
                            variant="default"
                            onClick={() => markEntry("entry")}
                            className="flex-1 bg-primary hover:bg-primary/90"
                          >
                            <CheckCircle className="w-4 h-4 mr-2" />
                            Record Entry
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="p-4 bg-destructive/10 border-2 border-destructive/30 rounded-md">
                        <div className="flex items-center space-x-2 text-destructive mb-3">
                          <XCircle className="w-6 h-6" />
                          <span className="font-bold text-lg">❌ Entry Denied</span>
                        </div>
                        <p className="text-destructive font-semibold text-base mb-2">
                          {scanResult.error}
                        </p>
                        {scanResult.details && (
                          <p className="text-sm text-muted-foreground border-t border-destructive/20 pt-2 mt-2">
                            {scanResult.details}
                          </p>
                        )}
                      </div>
                      <div className="bg-muted/50 p-3 rounded text-sm text-muted-foreground">
                        <p className="font-medium mb-1">⚠️ Action Required:</p>
                        <p>Verify the UUID with the student or contact the administration office for assistance.</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="logs" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Clock className="w-5 h-5" />
                  <span>Entry/Exit Logs</span>
                </CardTitle>
                <CardDescription>
                  Real-time log of all student movements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {logs.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No logs recorded yet</p>
                    </div>
                  ) : (
                    logs.map((log) => {
                      const outpassData = log.outpass_requests;
                      const studentData = outpassData?.student;
                      return (
                        <div 
                          key={log.id} 
                          className="flex justify-between items-center p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center space-x-4">
                            <Badge 
                              className={log.action === "exit" 
                                ? "bg-warning text-warning-foreground" 
                                : "bg-success text-success-foreground"
                              }
                            >
                              {log.action.toUpperCase()}
                            </Badge>
                            <div>
                              <p className="font-medium">{studentData?.full_name || 'Unknown Student'}</p>
                              <p className="text-sm text-muted-foreground">
                                {studentData?.reg_no || 'N/A'} • {outpassData?.purpose || 'No purpose specified'}
                              </p>
                            </div>
                          </div>
                          
                          <div className="text-right text-sm">
                            <p className="font-medium">{new Date(log.verified_at).toLocaleString()}</p>
                            <p className="text-muted-foreground">Main Gate</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}