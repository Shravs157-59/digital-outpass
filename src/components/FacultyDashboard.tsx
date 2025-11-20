import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle, XCircle, Clock, User, LogOut, Calendar, BarChart3 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { approvalSchema } from "@/lib/schemas";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const [selectedPendingRequest, setSelectedPendingRequest] = useState<PendingRequest | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [previousOutpassCount, setPreviousOutpassCount] = useState<Record<string, number>>({});
  const [stats, setStats] = useState({
    pending: 0,
    approvedToday: 0,
    rejectedToday: 0,
    totalThisWeek: 0
  });
  const [studentDetails, setStudentDetails] = useState<any[]>([]);
  const [timeFilter, setTimeFilter] = useState<"daily" | "monthly">("daily");
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const { toast } = useToast();

  const fetchRequests = async () => {
    try {
      // Fetch pending requests at current approval level
      const { data, error } = await supabase
        .from('outpass_requests')
        .select(`
          *,
          student:profiles!outpass_requests_student_id_fkey (
            full_name,
            reg_no,
            department,
            branch,
            year,
            section
          )
        `)
        .eq('status', 'pending')
        .eq('current_approval_level', userData.role)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setPendingRequests(data as any || []);

      // Calculate stats
      const today = new Date().toISOString().split('T')[0];
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      // Get approval count based on role level
      const roleColumn = userData.role === 'class_incharge' ? 'class_incharge_id' : 
                        userData.role === 'hod' ? 'hod_id' : 
                        userData.role === 'principal' ? 'principal_id' : null;
      
      const approvedAtColumn = userData.role === 'class_incharge' ? 'class_incharge_approved_at' : 
                              userData.role === 'hod' ? 'hod_approved_at' : 
                              userData.role === 'principal' ? 'principal_approved_at' : null;

      let approvedTodayCount = 0;
      let rejectedTodayCount = 0;
      let weeklyTotalCount = 0;

      if (roleColumn && approvedAtColumn) {
        const { count: approvedCount } = await supabase
          .from('outpass_requests')
          .select('id', { count: 'exact', head: true })
          .eq(roleColumn, userData.id)
          .gte(approvedAtColumn, today);
        approvedTodayCount = approvedCount || 0;
      }

      const { count: rejectedCount } = await supabase
        .from('outpass_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'rejected')
        .eq('rejected_by', userData.id)
        .gte('rejected_at', today);
      rejectedTodayCount = rejectedCount || 0;

      if (roleColumn) {
        const { count: weeklyCount } = await supabase
          .from('outpass_requests')
          .select('id', { count: 'exact', head: true })
          .or(`${roleColumn}.eq.${userData.id},rejected_by.eq.${userData.id}`)
          .gte('created_at', weekAgo);
        weeklyTotalCount = weeklyCount || 0;
      }

      setStats({
        pending: data?.length || 0,
        approvedToday: approvedTodayCount,
        rejectedToday: rejectedTodayCount,
        totalThisWeek: weeklyTotalCount
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Unable to load pending requests. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentDetails = async () => {
    try {
      let studentIds: string[] = [];

      // First, get student IDs based on role filtering
      if (userData.role === 'class_incharge') {
        // Class incharge sees only their section
        const { data: students, error: studentsError } = await supabase
          .from('profiles')
          .select('id')
          .eq('department', userData.department)
          .eq('section', userData.section)
          .eq('role', 'student');
        
        if (studentsError) throw studentsError;
        studentIds = students?.map(s => s.id) || [];
      } else if (userData.role === 'hod') {
        // HOD sees their entire department
        const { data: students, error: studentsError } = await supabase
          .from('profiles')
          .select('id')
          .eq('department', userData.department)
          .eq('role', 'student');
        
        if (studentsError) throw studentsError;
        studentIds = students?.map(s => s.id) || [];
      }
      // Principal sees all students (no filter needed, studentIds stays empty)

      // Build query for outpass requests
      let query = supabase
        .from('outpass_requests')
        .select(`
          *,
          student:profiles!student_id (
            full_name,
            reg_no,
            department,
            branch,
            year,
            section
          )
        `);

      // Apply student ID filter if role requires it
      if (studentIds.length > 0) {
        query = query.in('student_id', studentIds);
      }

      // Apply time filter
      if (timeFilter === 'daily') {
        const startOfDay = `${selectedDate}T00:00:00`;
        const endOfDay = `${selectedDate}T23:59:59`;
        query = query.gte('created_at', startOfDay).lte('created_at', endOfDay);
      } else {
        const startOfMonth = `${selectedMonth}-01T00:00:00`;
        const year = parseInt(selectedMonth.split('-')[0]);
        const month = parseInt(selectedMonth.split('-')[1]);
        const lastDay = new Date(year, month, 0).getDate();
        const endOfMonth = `${selectedMonth}-${lastDay}T23:59:59`;
        query = query.gte('created_at', startOfMonth).lte('created_at', endOfMonth);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setStudentDetails(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Unable to load student details. Please try again.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    fetchStudentDetails();
  }, [timeFilter, selectedDate, selectedMonth]);

  const fetchPreviousOutpassCount = async (studentId: string) => {
    try {
      const { data, error } = await supabase
        .from('outpass_requests')
        .select('id')
        .eq('student_id', studentId)
        .eq('status', 'approved');
      
      if (error) throw error;
      return data?.length || 0;
    } catch (error) {
      return 0;
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

  useEffect(() => {
    const fetchCounts = async () => {
      const counts: Record<string, number> = {};
      for (const request of pendingRequests) {
        const count = await fetchPreviousOutpassCount(request.student_id);
        counts[request.student_id] = count;
      }
      setPreviousOutpassCount(counts);
    };
    
    if (pendingRequests.length > 0) {
      fetchCounts();
    }
  }, [pendingRequests]);

  const handleAction = (request: PendingRequest, action: "approve" | "reject") => {
    setSelectedRequest(request);
    setActionType(action);
  };

  const confirmAction = async () => {
    if (!selectedRequest || !actionType || processing) return;

    // Validate inputs
    const validation = approvalSchema.safeParse({
      request_id: selectedRequest.id,
      action: actionType === "approve" ? "approved" : "rejected",
      comments: remarks || undefined,
    });

    if (!validation.success) {
      const issue = validation.error.issues[0];
      toast({
        title: "Validation Error",
        description: issue?.message || "Please check your inputs",
        variant: "destructive",
      });
      return;
    }

    setProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('process-request', {
        body: validation.data,
      });

      if (error) {
        throw new Error(error.message || 'Failed to process request');
      }

      toast({
        title: "Success",
        description: `Request ${actionType === "approve" ? "approved" : "rejected"} successfully`,
      });

      setSelectedRequest(null);
      setActionType(null);
      setRemarks("");
      fetchRequests();
    } catch (error: any) {
      console.error('Process request error:', error);
      toast({
        title: "Error",
        description: error.message || "Could not process the action. Please try again.",
        variant: "destructive",
      });
    } finally {
      setProcessing(false);
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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="pending">Pending Requests</TabsTrigger>
            <TabsTrigger value="students">Student Details</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4 mt-6">
            {!selectedPendingRequest ? (
              <>
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold">
                    Gate Outpass Requests - {userData.department || 'All'} ({getRoleDisplayName()} Panel)
                  </h2>
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
                  <Card>
                    <CardContent className="p-0">
                      <ScrollArea className="h-[500px]">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-primary hover:bg-primary">
                              <TableHead className="text-primary-foreground">Name</TableHead>
                              <TableHead className="text-primary-foreground">Roll Number</TableHead>
                              <TableHead className="text-primary-foreground">Year</TableHead>
                              <TableHead className="text-primary-foreground">Reason</TableHead>
                              <TableHead className="text-primary-foreground">Date & Time</TableHead>
                              <TableHead className="text-primary-foreground">Previous Outpasses</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pendingRequests.map((request) => (
                              <TableRow 
                                key={request.id} 
                                className="cursor-pointer hover:bg-muted/50"
                                onClick={() => setSelectedPendingRequest(request)}
                              >
                                <TableCell className="font-medium">
                                  {request.student?.full_name || 'N/A'}
                                </TableCell>
                                <TableCell>{request.student?.reg_no || 'N/A'}</TableCell>
                                <TableCell>{request.student?.year || 'N/A'}</TableCell>
                                <TableCell>
                                  <Badge variant="outline">{request.purpose}</Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="text-sm">
                                    {new Date(request.from_date).toLocaleString('en-US', {
                                      year: 'numeric',
                                      month: '2-digit',
                                      day: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit',
                                      hour12: true
                                    })}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <span className="text-primary font-semibold">
                                    {previousOutpassCount[request.student_id] || 0}
                                  </span>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}
              </>
            ) : (
              <Card>
                <CardHeader className="border-b">
                  <div className="flex items-center justify-center">
                    <img 
                      src="/src/assets/college-logo.png" 
                      alt="College Logo" 
                      className="w-16 h-16 object-contain"
                    />
                  </div>
                  <CardTitle className="text-center text-2xl">
                    Gate Outpass - {userData.department || 'Department'}
                  </CardTitle>
                  <p className="text-center text-muted-foreground">
                    {getRoleDisplayName()} Panel
                  </p>
                </CardHeader>
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-4">
                    <div>
                      <Label className="text-base font-semibold">Student Name</Label>
                      <div className="mt-1 p-3 bg-muted rounded-md">
                        {selectedPendingRequest.student?.full_name || 'N/A'}
                      </div>
                    </div>

                    <div>
                      <Label className="text-base font-semibold">Roll Number</Label>
                      <div className="mt-1 p-3 bg-muted rounded-md">
                        {selectedPendingRequest.student?.reg_no || 'N/A'}
                      </div>
                    </div>

                    <div>
                      <Label className="text-base font-semibold">Year</Label>
                      <div className="mt-1 p-3 bg-muted rounded-md">
                        {selectedPendingRequest.student?.year || 'N/A'}
                      </div>
                    </div>

                    <div>
                      <Label className="text-base font-semibold">Department</Label>
                      <div className="mt-1 p-3 bg-muted rounded-md">
                        {selectedPendingRequest.student?.department || 'N/A'}
                      </div>
                    </div>

                    <div>
                      <Label className="text-base font-semibold">Reason for Outpass</Label>
                      <div className="mt-1 p-3 bg-muted rounded-md min-h-[80px]">
                        {selectedPendingRequest.purpose}
                      </div>
                    </div>

                    <div>
                      <Label className="text-base font-semibold">Requested Date & Time</Label>
                      <div className="mt-1 p-3 bg-muted rounded-md">
                        {new Date(selectedPendingRequest.from_date).toLocaleString('en-US', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: true
                        })}
                      </div>
                    </div>

                    <div className="p-4 bg-primary/10 border border-primary/20 rounded-md">
                      <span className="text-primary font-semibold">
                        Previous Outpass Count: {previousOutpassCount[selectedPendingRequest.student_id] || 0}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-4 border-t">
                    <Button
                      variant="outline"
                      onClick={() => setSelectedPendingRequest(null)}
                    >
                      Back to List
                    </Button>
                    <div className="flex gap-3">
                      <Button
                        className="bg-success hover:bg-success/90"
                        onClick={() => {
                          handleAction(selectedPendingRequest, "approve");
                          setSelectedPendingRequest(null);
                        }}
                      >
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Accept
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => {
                          handleAction(selectedPendingRequest, "reject");
                          setSelectedPendingRequest(null);
                        }}
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="students" className="space-y-4 mt-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold">Student Outpass Details</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  {userData.role === 'class_incharge' && `Your Section - ${userData.section || 'All'}`}
                  {userData.role === 'hod' && `Department - ${userData.department || 'All'}`}
                  {userData.role === 'principal' && 'All Departments'}
                </p>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Label className="text-sm">View:</Label>
                  <Select value={timeFilter} onValueChange={(value: "daily" | "monthly") => setTimeFilter(value)}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {timeFilter === "daily" ? (
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-3 py-2 border border-input rounded-md bg-background"
                  />
                ) : (
                  <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-3 py-2 border border-input rounded-md bg-background"
                  />
                )}
              </div>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Outpass Records</CardTitle>
                    <CardDescription>
                      Total requests: {studentDetails.length}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="text-lg px-4 py-2">
                    <BarChart3 className="w-4 h-4 mr-2" />
                    {studentDetails.length} Students
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {studentDetails.length === 0 ? (
                  <div className="text-center py-12">
                    <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">No outpass records found for the selected period</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student Name</TableHead>
                          <TableHead>Reg No</TableHead>
                          <TableHead>Department</TableHead>
                          {userData.role === 'principal' && <TableHead>Section</TableHead>}
                          <TableHead>Purpose</TableHead>
                          <TableHead>Date & Time</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {studentDetails.map((request) => (
                          <TableRow key={request.id}>
                            <TableCell className="font-medium">
                              {request.student?.full_name || 'N/A'}
                            </TableCell>
                            <TableCell>{request.student?.reg_no || 'N/A'}</TableCell>
                            <TableCell>
                              {request.student?.department || 'N/A'}
                              {request.student?.year && ` - ${request.student.year}`}
                            </TableCell>
                            {userData.role === 'principal' && (
                              <TableCell>{request.student?.section || 'N/A'}</TableCell>
                            )}
                            <TableCell>
                              <Badge variant="outline">{request.purpose}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                <div>{new Date(request.from_date).toLocaleDateString()}</div>
                                <div className="text-muted-foreground text-xs">
                                  {new Date(request.from_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={
                                  request.status === 'approved' ? 'default' : 
                                  request.status === 'rejected' ? 'destructive' : 
                                  'secondary'
                                }
                                className={
                                  request.status === 'approved' ? 'bg-success hover:bg-success/90' : ''
                                }
                              >
                                {request.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
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
                  disabled={processing}
                  className={actionType === "approve" ? "flex-1 bg-success hover:bg-success/90" : "flex-1"}
                >
                  {processing ? "Processing..." : `Confirm ${actionType === "approve" ? "Approval" : "Rejection"}`}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => setSelectedRequest(null)} 
                  disabled={processing}
                  className="flex-1"
                >
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