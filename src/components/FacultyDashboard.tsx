import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Clock, User, LogOut, Calendar } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

interface PendingRequest {
  id: string;
  student_id: string;
  purpose: string;
  created_at: string;
  from_date: string;
  to_date: string;
  status: string;
  student?: {
    full_name: string;
    reg_no: string;
    department: string;
    year: string;
  };
}

interface FacultyDashboardProps {
  userData: any;
  onLogout: () => void;
}

export default function FacultyDashboard({ userData, onLogout }: FacultyDashboardProps) {
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    pending: 0,
    approvedToday: 0,
    rejectedToday: 0,
    totalThisWeek: 0
  });
  const { toast } = useToast();

  const fetchRequests = async () => {
    try {
      // Fetch pending requests visible to this role
      const { data, error } = await supabase
        .from('outpass_requests')
        .select(`
          *,
          student:profiles!student_id (
            full_name,
            reg_no,
            department,
            year
          )
        `)
        .eq('status', 'pending')
        .contains('visible_to_roles', [userData.role])
        .order('created_at', { ascending: true });

      if (error) throw error;
      setPendingRequests(data as any || []);

      // Calculate stats
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: approvedToday } = await supabase
        .from('outpass_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'approved')
        .eq('approved_by', userData.id)
        .gte('approved_at', today);

      const { data: rejectedToday } = await supabase
        .from('outpass_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'rejected')
        .eq('rejected_by', userData.id)
        .gte('rejected_at', today);

      const { data: weeklyTotal } = await supabase
        .from('outpass_requests')
        .select('id', { count: 'exact', head: true })
        .or(`approved_by.eq.${userData.id},rejected_by.eq.${userData.id}`)
        .gte('created_at', weekAgo);

      setStats({
        pending: data?.length || 0,
        approvedToday: approvedToday?.length || 0,
        rejectedToday: rejectedToday?.length || 0,
        totalThisWeek: weeklyTotal?.length || 0
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
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
      .channel('faculty-requests')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'outpass_requests'
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
  }, [userData.id, userData.role]);

  const handleAction = (request: PendingRequest, action: "approve" | "reject") => {
    setSelectedRequest(request);
    setActionType(action);
  };

  const confirmAction = async () => {
    if (!selectedRequest || !actionType) return;

    try {
      const { error } = await supabase.functions.invoke('process-request', {
        body: {
          request_id: selectedRequest.id,
          action: actionType === "approve" ? "approved" : "rejected",
          comments: remarks
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Request ${actionType === "approve" ? "approved" : "rejected"} successfully`
      });

      setSelectedRequest(null);
      setActionType(null);
      setRemarks("");
      fetchRequests();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const getRoleDisplayName = () => {
    const roleNames: Record<string, string> = {
      class_incharge: "Class In-Charge",
      coordinator: "Coordinator", 
      hod: "Head of Department",
      principal: "Principal"
    };
    return roleNames[userData.role] || userData.role;
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

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
                <p className="text-muted-foreground text-sm">Welcome, {userData.full_name || "Faculty"}</p>
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
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pending">Pending Requests</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4 mt-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Pending Approvals</h2>
              <Badge variant="outline" className="text-warning border-warning">
                {pendingRequests.length} pending
              </Badge>
            </div>

            {pendingRequests.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <CheckCircle className="w-12 h-12 text-success mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">All caught up!</h3>
                  <p className="text-muted-foreground">No pending requests at the moment.</p>
                </CardContent>
              </Card>
            ) : (
              pendingRequests.map((request) => (
                <Card key={request.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-4">
                          <h3 className="font-semibold text-lg">#{request.id.slice(0, 8)}</h3>
                          <Badge variant="outline">{request.purpose}</Badge>
                        </div>
                        <p className="text-muted-foreground">
                          {request.student?.full_name} ({request.student?.reg_no}) - {request.student?.department}, {request.student?.year}
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          variant="default"
                          size="sm"
                          onClick={() => handleAction(request, "approve")}
                          className="bg-success hover:bg-success/90"
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
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Recent Actions</CardTitle>
                <CardDescription>Your approval/rejection history</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-center py-8">
                  History view - fetches recent approvals/rejections from database
                </p>
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
              {actionType === "approve" ? "Approve" : "Reject"} Request
            </DialogTitle>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg">
                <p><strong>Student:</strong> {selectedRequest.student?.full_name}</p>
                <p><strong>Purpose:</strong> {selectedRequest.purpose}</p>
                <p><strong>Dates:</strong> {new Date(selectedRequest.from_date).toLocaleString()} to {new Date(selectedRequest.to_date).toLocaleString()}</p>
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
                  variant={actionType === "approve" ? "default" : "destructive"}
                  onClick={confirmAction}
                  className={actionType === "approve" ? "flex-1 bg-success hover:bg-success/90" : "flex-1"}
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