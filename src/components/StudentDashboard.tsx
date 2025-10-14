import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Clock, Download, Plus, LogOut, QrCode, Settings } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import ProfileSettings from "./ProfileSettings";

interface OutpassRequest {
  id: string;
  purpose: string;
  created_at: string;
  from_date: string;
  to_date: string;
  status: string;
  approved_by?: string | null;
  qr_code?: string | null;
}

interface StudentDashboardProps {
  userData: any;
  onLogout: () => void;
}

export default function StudentDashboard({ userData: initialUserData, onLogout }: StudentDashboardProps) {
  const [userData, setUserData] = useState(initialUserData);
  const [outpassRequests, setOutpassRequests] = useState<OutpassRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRequest, setNewRequest] = useState({
    purpose: "",
    fromDate: "",
    toDate: "",
  });
  const [showNewRequestDialog, setShowNewRequestDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("requests");

  useEffect(() => {
    if (!userData?.id) return;

    const fetchRequests = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("outpass_requests")
        .select("*")
        .eq("student_id", userData.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching outpass requests:", error);
      } else {
        setOutpassRequests(data || []);
      }
      setLoading(false);
    };

    fetchRequests();

    const channel = supabase
      .channel(`student_requests_${userData.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "outpass_requests",
          filter: `student_id=eq.${userData.id}`,
        },
        (payload) => {
          console.log("Realtime update received!", payload);
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userData]);

  const currentMonth = new Date().getMonth();
  const monthlyLimit = 4;
  const usedThisMonth = outpassRequests.filter(req => 
    new Date(req.created_at).getMonth() === currentMonth
  ).length;

  const handleSubmitRequest = async () => {
    if (!userData?.id) {
      alert("Could not identify student. Please log in again.");
      return;
    }

    if (!newRequest.purpose || !newRequest.fromDate || !newRequest.toDate) {
      alert("Please fill in all required fields");
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('request-outpass', {
        body: {
          purpose: newRequest.purpose,
          from_date: newRequest.fromDate,
          to_date: newRequest.toDate,
        }
      });

      if (error) throw error;

      console.log("Request submitted successfully:", data);
      setNewRequest({
        purpose: "",
        fromDate: "",
        toDate: "",
      });
      setShowNewRequestDialog(false);
    } catch (error: any) {
      alert("Error submitting request: " + error.message);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "approved": return "bg-green-500 text-white";
      case "rejected": return "bg-red-500 text-white";
      default: return "bg-yellow-500 text-white";
    }
  };

  const generateQRCode = (requestId: string) => {
    alert(`QR Code for ${requestId}. This needs an Edge Function to generate.`);
  };

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading student data...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary-light/10">
      <header className="bg-card/80 backdrop-blur-sm border-b shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <Avatar className="h-10 w-10">
                <AvatarImage src={userData?.photo_url} alt={userData?.full_name} />
                <AvatarFallback>{userData?.full_name?.charAt(0) || "S"}</AvatarFallback>
              </Avatar>
              <div>
                <h1 className="text-xl font-semibold">Student Dashboard</h1>
                <p className="text-muted-foreground text-sm">Welcome, {userData?.full_name || "Student"}</p>
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
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2 mb-8">
            <TabsTrigger value="requests">Requests</TabsTrigger>
            <TabsTrigger value="profile">
              <Settings className="w-4 h-4 mr-2" />
              Profile
            </TabsTrigger>
          </TabsList>

          <TabsContent value="requests" className="space-y-8">
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
                    {outpassRequests.filter(req => req.status === "pending").length}
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
                      req.status === "approved" && req.from_date === new Date().toISOString().split('T')[0]
                    ).length}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Ready to use</p>
                </CardContent>
              </Card>
            </div>

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
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="reason">Reason</Label>
                      <Select value={newRequest.purpose} onValueChange={(value) => 
                        setNewRequest(prev => ({ ...prev, purpose: value }))
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
                      <Label htmlFor="fromDate">From Date</Label>
                      <Input
                        id="fromDate"
                        type="datetime-local"
                        value={newRequest.fromDate}
                        onChange={(e) => setNewRequest(prev => ({ ...prev, fromDate: e.target.value }))}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="toDate">To Date</Label>
                      <Input
                        id="toDate"
                        type="datetime-local"
                        value={newRequest.toDate}
                        onChange={(e) => setNewRequest(prev => ({ ...prev, toDate: e.target.value }))}
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

            <div className="space-y-4">
              {outpassRequests.length === 0 ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <p className="text-muted-foreground">No outpass requests yet. Create your first request above!</p>
                  </CardContent>
                </Card>
              ) : (
                outpassRequests.map((request) => (
                  <Card key={request.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h3 className="font-semibold text-lg">#{request.id.slice(0, 8)}...</h3>
                          <p className="text-muted-foreground capitalize">{request.purpose}</p>
                        </div>
                        <Badge className={getStatusColor(request.status)}>
                          {request.status.toUpperCase()}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center space-x-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span>Applied: {new Date(request.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span>From: {new Date(request.from_date).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Clock className="w-4 h-4 text-muted-foreground" />
                          <span>To: {new Date(request.to_date).toLocaleDateString()}</span>
                        </div>
                        {request.status === "approved" && (
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
                      
                      {request.approved_by && (
                        <p className="text-xs text-green-600 mt-2">
                          Approved by: {request.approved_by}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="profile">
            <ProfileSettings userData={userData} onUpdate={setUserData} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
