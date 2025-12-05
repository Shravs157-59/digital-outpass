import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar, Clock, Download, Plus, User, LogOut, QrCode, Pencil } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { outpassRequestSchema } from "@/lib/schemas";

interface OutpassRequest {
  id: string;
  purpose: string;
  created_at: string;
  from_date: string;
  to_date: string;
  status: string;
  approved_by?: string | null;
  qr_code?: string | null;
  approved_at?: string | null;
}

interface StudentDashboardProps {
  userData: any;
  onLogout: () => void;
}

export default function StudentDashboard({ userData, onLogout }: StudentDashboardProps) {
  const [outpassRequests, setOutpassRequests] = useState<OutpassRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const [newRequest, setNewRequest] = useState({
    purpose: "",
    fromDate: "",
    toDate: ""
  });

  const [showNewRequestDialog, setShowNewRequestDialog] = useState(false);
  const [showEditProfileDialog, setShowEditProfileDialog] = useState(false);
  const [profileForm, setProfileForm] = useState({
    reg_no: userData.reg_no || "",
    department: userData.department || "",
    year: userData.year || "",
    section: userData.section || "",
  });
  const [savingProfile, setSavingProfile] = useState(false);

  // Check if profile is complete
  const isProfileComplete = Boolean(
    userData.reg_no && 
    userData.department && 
    userData.year && 
    userData.section
  );

  const missingFields = [
    !userData.reg_no && "Roll Number",
    !userData.department && "Department",
    !userData.year && "Year",
    !userData.section && "Section"
  ].filter(Boolean);

  // Fetch student's outpass requests
  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('outpass_requests')
        .select('*')
        .eq('student_id', userData.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setOutpassRequests(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Unable to load your requests. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();

    // Subscribe to realtime changes
    const channel = supabase
      .channel('student-requests')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'outpass_requests',
          filter: `student_id=eq.${userData.id}`
        },
        (payload) => {
          console.log('Realtime update:', payload);
          fetchRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userData.id]);

  const currentMonth = new Date().getMonth();
  const monthlyLimit = 4;
  const usedThisMonth = outpassRequests.filter(req => 
    new Date(req.created_at).getMonth() === currentMonth
  ).length;

  const handleSubmitRequest = async () => {
    // Check profile completeness first
    if (!isProfileComplete) {
      toast({
        title: "Profile Incomplete",
        description: `Please complete your profile first. Missing: ${missingFields.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    // Check monthly limit before submitting
    if (usedThisMonth >= monthlyLimit) {
      toast({
        title: "Monthly Limit Exceeded",
        description: `You have already submitted ${monthlyLimit} outpass requests this month. Please try again next month.`,
        variant: "destructive",
      });
      return;
    }

    // Client-side validation
    const validation = outpassRequestSchema.safeParse({
      purpose: newRequest.purpose,
      from_date: newRequest.fromDate ? new Date(newRequest.fromDate).toISOString() : "",
      to_date: newRequest.toDate ? new Date(newRequest.toDate).toISOString() : "",
    });

    if (!validation.success) {
      const firstIssue = validation.error.issues[0];
      toast({
        title: "Validation Error",
        description: firstIssue?.message || "Please check your inputs",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('request-outpass', {
        body: validation.data,
      });

      if (error) {
        // Check if it's a monthly limit error
        const errorMessage = error.message || error.context?.error || JSON.stringify(error);
        if (errorMessage.includes('Monthly outpass limit exceeded')) {
          toast({
            title: "Monthly Limit Exceeded",
            description: "You have already submitted 4 outpass requests this month. Please try again next month.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Error",
            description: errorMessage.includes('error') ? errorMessage : "Could not submit request. Please try again.",
            variant: "destructive",
          });
        }
        return;
      }

      toast({
        title: "Success",
        description: "Outpass request submitted successfully",
      });

      setNewRequest({
        purpose: "",
        fromDate: "",
        toDate: "",
      });
      setShowNewRequestDialog(false);
      fetchRequests();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Could not submit request. Please try again.",
        variant: "destructive",
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "approved": return "bg-success text-success-foreground";
      case "rejected": return "bg-destructive text-destructive-foreground";
      default: return "bg-warning text-warning-foreground";
    }
  };

  const generateQRCode = (requestId: string) => {
    alert(`QR Code for ${requestId}. Implementation needed for actual QR generation.`);
  };

  const handleSaveProfile = async () => {
    if (!profileForm.reg_no || !profileForm.department || !profileForm.year || !profileForm.section) {
      toast({
        title: "Validation Error",
        description: "Please fill in all fields",
        variant: "destructive",
      });
      return;
    }

    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          reg_no: profileForm.reg_no.trim(),
          department: profileForm.department,
          year: profileForm.year,
          section: profileForm.section.trim().toUpperCase(),
        })
        .eq("id", userData.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Profile updated successfully. Please refresh to see changes.",
      });
      setShowEditProfileDialog(false);
      // Trigger page refresh to get updated userData
      window.location.reload();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile",
        variant: "destructive",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

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
                <p className="text-muted-foreground text-sm">Welcome, {userData.full_name || "Student"}</p>
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
        {/* Profile Incomplete Warning */}
        {!isProfileComplete && (
          <Card className="mb-6 border-warning bg-warning/10">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-warning/20 flex items-center justify-center">
                    <User className="w-5 h-5 text-warning" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-warning">Profile Incomplete</h3>
                    <p className="text-sm text-muted-foreground">
                      Missing: {missingFields.join(", ")}
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowEditProfileDialog(true)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Complete Profile
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Edit Profile Dialog */}
        <Dialog open={showEditProfileDialog} onOpenChange={setShowEditProfileDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Profile</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="reg_no">Roll Number / Registration Number</Label>
                <Input
                  id="reg_no"
                  placeholder="e.g., 21A91A0501"
                  value={profileForm.reg_no}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, reg_no: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Select
                  value={profileForm.department}
                  onValueChange={(value) => setProfileForm(prev => ({ ...prev, department: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CSE">Computer Science & Engineering</SelectItem>
                    <SelectItem value="ECE">Electronics & Communication</SelectItem>
                    <SelectItem value="EEE">Electrical & Electronics</SelectItem>
                    <SelectItem value="MECH">Mechanical Engineering</SelectItem>
                    <SelectItem value="CIVIL">Civil Engineering</SelectItem>
                    <SelectItem value="IT">Information Technology</SelectItem>
                    <SelectItem value="AIDS">AI & Data Science</SelectItem>
                    <SelectItem value="AIML">AI & Machine Learning</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="year">Year</Label>
                <Select
                  value={profileForm.year}
                  onValueChange={(value) => setProfileForm(prev => ({ ...prev, year: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1st Year</SelectItem>
                    <SelectItem value="2">2nd Year</SelectItem>
                    <SelectItem value="3">3rd Year</SelectItem>
                    <SelectItem value="4">4th Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="section">Section</Label>
                <Input
                  id="section"
                  placeholder="e.g., A, B, C"
                  value={profileForm.section}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, section: e.target.value }))}
                  maxLength={2}
                />
              </div>
            </div>
            <Button onClick={handleSaveProfile} className="w-full mt-4" disabled={savingProfile}>
              {savingProfile ? "Saving..." : "Save Profile"}
            </Button>
          </DialogContent>
        </Dialog>

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
                {outpassRequests.filter(req => req.status === "pending").length}
              </div>
              <p className="text-xs text-muted-foreground mt-2">Awaiting approval</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Approved</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-success">
                {outpassRequests.filter(req => req.status === "approved").length}
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
              <Button variant="default" size="lg" disabled={!isProfileComplete}>
                <Plus className="w-4 h-4 mr-2" />
                New Request
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Apply for Outpass</DialogTitle>
              </DialogHeader>
              
              <div className="grid gap-4 mt-4">
                <div className="space-y-2">
                  <Label htmlFor="purpose">Purpose</Label>
                  <Textarea
                    id="purpose"
                    placeholder="Reason for outpass"
                    value={newRequest.purpose}
                    onChange={(e) => setNewRequest(prev => ({ ...prev, purpose: e.target.value }))}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fromDate">From Date & Time</Label>
                    <Input
                      id="fromDate"
                      type="datetime-local"
                      value={newRequest.fromDate}
                      onChange={(e) => setNewRequest(prev => ({ ...prev, fromDate: e.target.value }))}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="toDate">To Date & Time</Label>
                    <Input
                      id="toDate"
                      type="datetime-local"
                      value={newRequest.toDate}
                      onChange={(e) => setNewRequest(prev => ({ ...prev, toDate: e.target.value }))}
                    />
                  </div>
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
          {outpassRequests.length === 0 ? (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-muted-foreground">No outpass requests yet. Create your first request!</p>
              </CardContent>
            </Card>
          ) : (
            outpassRequests.map((request) => (
              <Card key={request.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-semibold text-lg">Outpass #{request.id.slice(0, 8)}</h3>
                      <p className="text-muted-foreground">{request.purpose}</p>
                    </div>
                    <Badge 
                      className={`${getStatusColor(request.status)} text-sm px-3 py-1`}
                    >
                      {request.status === 'approved' && '✓ '}
                      {request.status === 'rejected' && '✗ '}
                      {request.status === 'pending' && '⏳ '}
                      {request.status.toUpperCase()}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div className="flex items-center space-x-2">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span>Applied: {new Date(request.created_at).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span>From: {new Date(request.from_date).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Clock className="w-4 h-4 text-muted-foreground" />
                      <span>To: {new Date(request.to_date).toLocaleString()}</span>
                    </div>
                  </div>
                  
                  {request.status === "approved" && (
                    <div className="flex space-x-2 mt-4">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => generateQRCode(request.id)}
                      >
                        <QrCode className="w-4 h-4 mr-1" />
                        Show QR Code
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="w-4 h-4 mr-1" />
                        Download PDF
                      </Button>
                    </div>
                  )}

                  {request.status === "rejected" && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 mt-4">
                      <p className="text-sm text-destructive font-medium">
                        ❌ This outpass request was rejected
                      </p>
                    </div>
                  )}

                  {request.status === "pending" && (
                    <div className="bg-warning/10 border border-warning/20 rounded-md p-3 mt-4">
                      <p className="text-sm text-warning font-medium">
                        ⏳ Awaiting faculty approval
                      </p>
                    </div>
                  )}

                  {request.approved_at && request.status === "approved" && (
                    <p className="text-xs text-success mt-2">
                      ✓ Approved on: {new Date(request.approved_at).toLocaleString()}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}