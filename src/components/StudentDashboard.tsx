import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, Download, Plus, User, LogOut, QrCode } from "lucide-react";

interface OutpassRequest {
  id: string;
  reason: string;
  dateApplied: string;
  fromDate: string;
  toDate: string;
  status: "Pending" | "Approved" | "Rejected";
  approvedBy?: string;
  qrCode?: string;
}

interface StudentDashboardProps {
  userData: any;
  onLogout: () => void;
}

export default function StudentDashboard({ userData, onLogout }: StudentDashboardProps) {
  const [outpassRequests, setOutpassRequests] = useState<OutpassRequest[]>([
    {
      id: "OUT001",
      reason: "Medical Appointment",
      dateApplied: "2024-01-15",
      fromDate: "2024-01-20",
      toDate: "2024-01-20",
      status: "Approved",
      approvedBy: "Dr. Smith (Class In-Charge)",
      qrCode: "QR123456"
    },
    {
      id: "OUT002", 
      reason: "Family Function",
      dateApplied: "2024-01-18",
      fromDate: "2024-01-25",
      toDate: "2024-01-26",
      status: "Pending"
    }
  ]);

  const [newRequest, setNewRequest] = useState({
    reason: "",
    fromDate: "",
    toDate: "",
    destination: "",
    contactNumber: "",
    emergencyContact: ""
  });

  const [showNewRequestDialog, setShowNewRequestDialog] = useState(false);

  const currentMonth = new Date().getMonth();
  const monthlyLimit = 4;
  const usedThisMonth = outpassRequests.filter(req => 
    new Date(req.dateApplied).getMonth() === currentMonth
  ).length;

  const handleSubmitRequest = () => {
    const request: OutpassRequest = {
      id: `OUT${String(outpassRequests.length + 1).padStart(3, "0")}`,
      reason: newRequest.reason,
      dateApplied: new Date().toISOString().split('T')[0],
      fromDate: newRequest.fromDate,
      toDate: newRequest.toDate,
      status: usedThisMonth >= monthlyLimit ? "Pending" : "Pending"
    };

    setOutpassRequests(prev => [request, ...prev]);
    setNewRequest({
      reason: "",
      fromDate: "",
      toDate: "",
      destination: "",
      contactNumber: "",
      emergencyContact: ""
    });
    setShowNewRequestDialog(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Approved": return "bg-success text-success-foreground";
      case "Rejected": return "bg-destructive text-destructive-foreground";
      default: return "bg-warning text-warning-foreground";
    }
  };

  const generateQRCode = (requestId: string) => {
    // Simulate QR code generation
    alert(`QR Code generated for ${requestId}. In a real app, this would generate a downloadable QR code.`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary-light/10">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <User className="w-8 h-8 text-primary" />
              <div>
                <h1 className="text-xl font-semibold">Student Dashboard</h1>
                <p className="text-muted-foreground text-sm">Welcome, {userData.fullName || "Student"}</p>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Monthly Usage</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{usedThisMonth}/{monthlyLimit}</div>
              <Progress value={(usedThisMonth / monthlyLimit) * 100} className="mt-2" />
              <p className="text-xs text-muted-foreground mt-2">
                {monthlyLimit - usedThisMonth} requests remaining
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Active Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">
                {outpassRequests.filter(req => req.status === "Pending").length}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Awaiting approval</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Approved Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">
                {outpassRequests.filter(req => 
                  req.status === "Approved" && req.fromDate === new Date().toISOString().split('T')[0]
                ).length}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Ready to use</p>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Outpass Requests</h2>
          <Dialog open={showNewRequestDialog} onOpenChange={setShowNewRequestDialog}>
            <DialogTrigger asChild>
              <Button variant="default" size="lg">
                <Plus className="w-4 h-4 mr-2" />
                New Request
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Apply for Outpass</DialogTitle>
              </DialogHeader>
              
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="reason">Reason</Label>
                  <Select value={newRequest.reason} onValueChange={(value) => 
                    setNewRequest(prev => ({ ...prev, reason: value }))
                  }>
                    <SelectTrigger>
                      <SelectValue placeholder="Select reason" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="medical">Medical Appointment</SelectItem>
                      <SelectItem value="family">Family Function</SelectItem>
                      <SelectItem value="personal">Personal Work</SelectItem>
                      <SelectItem value="emergency">Emergency</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="destination">Destination</Label>
                  <Input
                    id="destination"
                    placeholder="Where are you going?"
                    value={newRequest.destination}
                    onChange={(e) => setNewRequest(prev => ({ ...prev, destination: e.target.value }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="fromDate">From Date</Label>
                  <Input
                    id="fromDate"
                    type="date"
                    value={newRequest.fromDate}
                    onChange={(e) => setNewRequest(prev => ({ ...prev, fromDate: e.target.value }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="toDate">To Date</Label>
                  <Input
                    id="toDate"
                    type="date"
                    value={newRequest.toDate}
                    onChange={(e) => setNewRequest(prev => ({ ...prev, toDate: e.target.value }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="contactNumber">Contact Number</Label>
                  <Input
                    id="contactNumber"
                    placeholder="Your contact number"
                    value={newRequest.contactNumber}
                    onChange={(e) => setNewRequest(prev => ({ ...prev, contactNumber: e.target.value }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="emergencyContact">Emergency Contact</Label>
                  <Input
                    id="emergencyContact"
                    placeholder="Emergency contact number"
                    value={newRequest.emergencyContact}
                    onChange={(e) => setNewRequest(prev => ({ ...prev, emergencyContact: e.target.value }))}
                  />
                </div>
              </div>
              
              {usedThisMonth >= monthlyLimit && (
                <div className="bg-warning/10 border border-warning rounded-lg p-3 mt-4">
                  <p className="text-warning text-sm">
                    ⚠️ You have reached your monthly limit. This request will be forwarded to HOD for approval.
                  </p>
                </div>
              )}
              
              <Button onClick={handleSubmitRequest} className="w-full mt-6" size="lg">
                Submit Request
              </Button>
            </DialogContent>
          </Dialog>
        </div>

        {/* Requests List */}
        <div className="space-y-4">
          {outpassRequests.map((request) => (
            <Card key={request.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">#{request.id}</h3>
                    <p className="text-muted-foreground">{request.reason}</p>
                  </div>
                  <Badge className={getStatusColor(request.status)}>
                    {request.status}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span>Applied: {request.dateApplied}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>From: {request.fromDate}</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Clock className="w-4 h-4 text-muted-foreground" />
                    <span>To: {request.toDate}</span>
                  </div>
                  {request.status === "Approved" && (
                    <div className="flex space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => generateQRCode(request.id)}
                      >
                        <QrCode className="w-4 h-4 mr-1" />
                        QR Code
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="w-4 h-4 mr-1" />
                        PDF
                      </Button>
                    </div>
                  )}
                </div>
                
                {request.approvedBy && (
                  <p className="text-xs text-success mt-2">
                    Approved by: {request.approvedBy}
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}