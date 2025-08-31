import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, QrCode, LogOut, User, Clock, CheckCircle, XCircle, Search } from "lucide-react";

interface LogEntry {
  id: string;
  studentName: string;
  regNo: string;
  action: "OUT" | "IN";
  timestamp: string;
  gate: string;
  outpassId: string;
}

interface SecurityDashboardProps {
  userData: any;
  onLogout: () => void;
}

export default function SecurityDashboard({ userData, onLogout }: SecurityDashboardProps) {
  const [qrInput, setQrInput] = useState("");
  const [scanResult, setScanResult] = useState<any>(null);
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "LOG001",
      studentName: "John Doe",
      regNo: "REG2023001",
      action: "OUT",
      timestamp: "2024-01-20 10:30:00",
      gate: "Main Gate",
      outpassId: "OUT001"
    },
    {
      id: "LOG002", 
      studentName: "Jane Smith",
      regNo: "REG2023002",
      action: "IN",
      timestamp: "2024-01-20 18:45:00",
      gate: "Main Gate",
      outpassId: "OUT002"
    }
  ]);

  const handleQRScan = () => {
    // Simulate QR code verification
    if (qrInput.includes("OUT")) {
      setScanResult({
        valid: true,
        outpassId: qrInput,
        studentName: "John Doe",
        regNo: "REG2023001",
        validFrom: "2024-01-20",
        validTo: "2024-01-20",
        reason: "Medical Appointment",
        status: "Approved"
      });
    } else {
      setScanResult({
        valid: false,
        error: "Invalid QR Code or Outpass not approved"
      });
    }
  };

  const markEntry = (action: "OUT" | "IN") => {
    if (scanResult && scanResult.valid) {
      const newLog: LogEntry = {
        id: `LOG${String(logs.length + 1).padStart(3, "0")}`,
        studentName: scanResult.studentName,
        regNo: scanResult.regNo,
        action,
        timestamp: new Date().toLocaleString(),
        gate: "Main Gate",
        outpassId: scanResult.outpassId
      };
      
      setLogs(prev => [newLog, ...prev]);
      setScanResult(null);
      setQrInput("");
    }
  };

  const todayLogs = logs.filter(log => 
    log.timestamp.startsWith(new Date().toISOString().split('T')[0])
  );

  const stats = {
    todayOut: todayLogs.filter(log => log.action === "OUT").length,
    todayIn: todayLogs.filter(log => log.action === "IN").length,
    currentlyOut: logs.reduce((acc, log) => {
      if (log.action === "OUT") acc++;
      if (log.action === "IN") acc--;
      return acc;
    }, 0),
    totalToday: todayLogs.length
  };

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
                    <Label htmlFor="qrInput">QR Code / Outpass ID</Label>
                    <Input
                      id="qrInput"
                      placeholder="Scan QR or enter Outpass ID (e.g., OUT001)"
                      value={qrInput}
                      onChange={(e) => setQrInput(e.target.value)}
                    />
                  </div>
                  
                  <Button onClick={handleQRScan} className="w-full" size="lg">
                    <Search className="w-4 h-4 mr-2" />
                    Verify Outpass
                  </Button>
                  
                  <div className="bg-muted/50 rounded-lg p-4 text-center text-sm text-muted-foreground">
                    📱 In a real implementation, this would use camera for QR scanning
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
                      <div className="flex items-center space-x-2 text-success">
                        <CheckCircle className="w-5 h-5" />
                        <span className="font-semibold">Valid Outpass</span>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <p><strong>Outpass ID:</strong> {scanResult.outpassId}</p>
                        <p><strong>Student:</strong> {scanResult.studentName}</p>
                        <p><strong>Reg No:</strong> {scanResult.regNo}</p>
                        <p><strong>Reason:</strong> {scanResult.reason}</p>
                        <p><strong>Valid Period:</strong> {scanResult.validFrom} to {scanResult.validTo}</p>
                        <Badge className="bg-success text-success-foreground">{scanResult.status}</Badge>
                      </div>
                      
                      <div className="flex space-x-2 pt-4">
                        <Button 
                          variant="warning" 
                          onClick={() => markEntry("OUT")}
                          className="flex-1"
                        >
                          Mark Exit
                        </Button>
                        <Button 
                          variant="success" 
                          onClick={() => markEntry("IN")}
                          className="flex-1"
                        >
                          Mark Return
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center space-x-2 text-destructive">
                        <XCircle className="w-5 h-5" />
                        <span className="font-semibold">Invalid Outpass</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{scanResult.error}</p>
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
                  {logs.map((log) => (
                    <div 
                      key={log.id} 
                      className="flex justify-between items-center p-4 border rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex items-center space-x-4">
                        <Badge 
                          className={log.action === "OUT" 
                            ? "bg-warning text-warning-foreground" 
                            : "bg-success text-success-foreground"
                          }
                        >
                          {log.action}
                        </Badge>
                        <div>
                          <p className="font-medium">{log.studentName}</p>
                          <p className="text-sm text-muted-foreground">
                            {log.regNo} • {log.outpassId}
                          </p>
                        </div>
                      </div>
                      
                      <div className="text-right text-sm">
                        <p className="font-medium">{log.timestamp}</p>
                        <p className="text-muted-foreground">{log.gate}</p>
                      </div>
                    </div>
                  ))}
                  
                  {logs.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No logs recorded yet</p>
                    </div>
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