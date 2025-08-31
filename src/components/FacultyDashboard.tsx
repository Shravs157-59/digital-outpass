import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Clock, User, LogOut, Calendar, Users, TrendingUp } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface PendingRequest {
  id: string;
  studentName: string;
  regNo: string;
  reason: string;
  dateApplied: string;
  fromDate: string;
  toDate: string;
  destination: string;
  contactNumber: string;
  department: string;
  year: string;
}

interface FacultyDashboardProps {
  userData: any;
  onLogout: () => void;
}

export default function FacultyDashboard({ userData, onLogout }: FacultyDashboardProps) {
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([
    {
      id: "OUT003",
      studentName: "John Doe",
      regNo: "REG2023001",
      reason: "Medical Appointment",
      dateApplied: "2024-01-20",
      fromDate: "2024-01-22",
      toDate: "2024-01-22",
      destination: "City Hospital",
      contactNumber: "+91 9876543210",
      department: "Computer Science",
      year: "3rd Year"
    },
    {
      id: "OUT004",
      studentName: "Jane Smith",
      regNo: "REG2023002", 
      reason: "Family Function",
      dateApplied: "2024-01-20",
      fromDate: "2024-01-25",
      toDate: "2024-01-26",
      destination: "Home Town",
      contactNumber: "+91 9876543211",
      department: "Computer Science",
      year: "2nd Year"
    }
  ]);

  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [remarks, setRemarks] = useState("");

  const handleAction = (request: PendingRequest, action: "approve" | "reject") => {
    setSelectedRequest(request);
    setActionType(action);
  };

  const confirmAction = () => {
    if (selectedRequest && actionType) {
      setPendingRequests(prev => prev.filter(req => req.id !== selectedRequest.id));
      setSelectedRequest(null);
      setActionType(null);
      setRemarks("");
      // In real app, would send notification to student
    }
  };

  const getRoleDisplayName = () => {
    const roleNames: Record<string, string> = {
      classincharge: "Class In-Charge",
      coordinator: "Coordinator", 
      hod: "Head of Department",
      principal: "Principal"
    };
    return roleNames[userData.role] || userData.role;
  };

  const stats = {
    pending: pendingRequests.length,
    approvedToday: 5,
    rejectedToday: 1,
    totalThisWeek: 23
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-success/5 via-background to-success/10">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <User className="w-8 h-8 text-success" />
              <div>
                <h1 className="text-xl font-semibold">{getRoleDisplayName()} Dashboard</h1>
                <p className="text-muted-foreground text-sm">Welcome, {userData.fullName || "Faculty"}</p>
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
              <CardTitle className="text-sm font-medium">Pending Approvals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{stats.pending}</div>
              <p className="text-xs text-muted-foreground mt-2">Awaiting your review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Approved Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">{stats.approvedToday}</div>
              <p className="text-xs text-muted-foreground mt-2">Successfully processed</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Rejected Today</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.rejectedToday}</div>
              <p className="text-xs text-muted-foreground mt-2">Not approved</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Weekly Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">{stats.totalThisWeek}</div>
              <p className="text-xs text-muted-foreground mt-2">This week's activity</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="pending" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pending">Pending Requests</TabsTrigger>
            <TabsTrigger value="analytics">Analytics</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4 mt-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Pending Approvals</h2>
              <Badge variant="outline" className="text-warning border-warning">
                {pendingRequests.length} pending
              </Badge>
            </div>

            {pendingRequests.map((request) => (
              <Card key={request.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div className="space-y-2">
                      <div className="flex items-center space-x-4">
                        <h3 className="font-semibold text-lg">#{request.id}</h3>
                        <Badge variant="outline">{request.reason}</Badge>
                      </div>
                      <p className="text-muted-foreground">
                        {request.studentName} ({request.regNo}) - {request.department}, {request.year}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <Button 
                        variant="success"
                        size="sm"
                        onClick={() => handleAction(request, "approve")}
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button 
                        variant="destructive"
                        size="sm"
                        onClick={() => handleAction(request, "reject")}
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </div>
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
                    <div>
                      <span className="text-muted-foreground">Destination: </span>
                      <span>{request.destination}</span>
                    </div>
                  </div>
                  
                  <div className="mt-3 text-sm">
                    <span className="text-muted-foreground">Contact: </span>
                    <span>{request.contactNumber}</span>
                  </div>
                </CardContent>
              </Card>
            ))}

            {pendingRequests.length === 0 && (
              <Card>
                <CardContent className="p-12 text-center">
                  <CheckCircle className="w-12 h-12 text-success mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">All caught up!</h3>
                  <p className="text-muted-foreground">No pending requests at the moment.</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <TrendingUp className="w-5 h-5" />
                    <span>Weekly Trends</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span>Monday</span>
                      <span className="font-semibold">8 requests</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Tuesday</span>
                      <span className="font-semibold">12 requests</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Wednesday</span>
                      <span className="font-semibold">15 requests</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Thursday</span>
                      <span className="font-semibold">10 requests</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Friday</span>
                      <span className="font-semibold">18 requests</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <Users className="w-5 h-5" />
                    <span>Top Reasons</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between">
                      <span>Medical</span>
                      <Badge variant="outline">35%</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Family Function</span>
                      <Badge variant="outline">28%</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Personal Work</span>
                      <Badge variant="outline">20%</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Emergency</span>
                      <Badge variant="outline">12%</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Other</span>
                      <Badge variant="outline">5%</Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Actions</CardTitle>
                <CardDescription>Your approval/rejection history</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">OUT002 - Alice Johnson</p>
                      <p className="text-sm text-muted-foreground">Medical Appointment</p>
                    </div>
                    <Badge className="bg-success text-success-foreground">Approved</Badge>
                  </div>
                  <div className="flex justify-between items-center p-3 border rounded-lg">
                    <div>
                      <p className="font-medium">OUT001 - Bob Wilson</p>
                      <p className="text-sm text-muted-foreground">Personal Work</p>
                    </div>
                    <Badge className="bg-destructive text-destructive-foreground">Rejected</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Action Confirmation Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "approve" ? "Approve" : "Reject"} Request #{selectedRequest?.id}
            </DialogTitle>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg">
                <p><strong>Student:</strong> {selectedRequest.studentName}</p>
                <p><strong>Reason:</strong> {selectedRequest.reason}</p>
                <p><strong>Dates:</strong> {selectedRequest.fromDate} to {selectedRequest.toDate}</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="remarks">Remarks (Optional)</Label>
                <Textarea
                  id="remarks"
                  placeholder="Add any comments or conditions..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
              
              <div className="flex space-x-2">
                <Button 
                  variant={actionType === "approve" ? "success" : "destructive"}
                  onClick={confirmAction}
                  className="flex-1"
                >
                  Confirm {actionType === "approve" ? "Approval" : "Rejection"}
                </Button>
                <Button variant="outline" onClick={() => setSelectedRequest(null)} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}