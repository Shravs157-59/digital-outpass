import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AuthFormsProps {
  role: string;
  onBack: () => void;
  onAuth: (userData: any) => void;
}

const departments = [
  "Computer Science & Engineering",
  "Computer Science & Engineering (CSM)",
  "Electronics & Communication",
  "Mechanical Engineering",
  "Civil Engineering",
  "Electrical Engineering",
  "Information Technology"
];

const years = ["1st Year", "2nd Year", "3rd Year", "4th Year"];

// Dynamic sections based on department and year
const getDepartmentSections = (dept: string, year: string) => {
  const yearNum = parseInt(year.charAt(0));
  
  switch (dept) {
    case "Computer Science & Engineering":
      if (yearNum === 1 || yearNum === 2) return ["A", "B", "C", "D", "E", "F"];
      if (yearNum === 3) return ["A", "B", "C", "D"];
      if (yearNum === 4) return ["A", "B", "C"];
      return [];
    
    case "Computer Science & Engineering (CSM)":
      return ["A"];
    
    case "Electronics & Communication":
    case "Electrical Engineering":
      return ["A", "B", "C"];
    
    case "Mechanical Engineering":
      return ["A", "B"];
    
    case "Civil Engineering":
    case "Information Technology":
      return ["A", "B", "C", "D"];
    
    default:
      return [];
  }
};

export default function AuthForms({ role, onBack, onAuth }: AuthFormsProps) {
  const [formData, setFormData] = useState({
    email: "",
    regNo: "",
    employeeId: "",
    securityId: "",
    fullName: "",
    phoneNumber: "",
    dob: "",
    dept: "",
    year: "",
    section: "",
    password: "",
    confirmPassword: "",
    photo: null as File | null
  });
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      // Clear section when department or year changes for faculty
      if (isFaculty && (field === "dept" || field === "year")) {
        newData.section = "";
      }
      return newData;
    });
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setFormData(prev => ({ ...prev, photo: file }));
  };

  const isStudent = role === "student";
  const isFaculty = ["classincharge", "coordinator", "hod", "principal"].includes(role);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords don't match!",
        variant: "destructive"
      });
      return;
    }

    if (formData.password.length < 6) {
      toast({
        title: "Error",
        description: "Password must be at least 6 characters long",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      // Map role to database format
      const roleMap: Record<string, string> = {
        'student': 'student',
        'classincharge': 'class_incharge',
        'coordinator': 'coordinator',
        'hod': 'hod',
        'principal': 'principal',
        'security': 'security'
      };
      const dbRole = roleMap[role] || role;

      // Sign up the user
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: formData.fullName,
            role: dbRole
          }
        }
      });

      if (signUpError) {
        toast({
          title: "Registration Failed",
          description: signUpError.message,
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      if (!authData.user) {
        toast({
          title: "Registration Failed",
          description: "Failed to create user account",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      // Upload photo if provided
      let photoUrl = null;
      if (formData.photo) {
        const fileExt = formData.photo.name.split('.').pop();
        const fileName = `${authData.user.id}-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('avatars')
          .upload(fileName, formData.photo);

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('avatars')
            .getPublicUrl(fileName);
          photoUrl = urlData.publicUrl;
        }
      }

      // Wait for trigger to create basic profile
      await new Promise(resolve => setTimeout(resolve, 800));

      // Use upsert to ensure profile is created/updated
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: authData.user.id,
          email: formData.email,
          full_name: formData.fullName,
          role: dbRole as any,
          department: formData.dept || null,
          branch: formData.dept || null,
          year: formData.year || null,
          section: formData.section || null,
          reg_no: formData.regNo || null,
          employee_id: formData.employeeId || null,
          security_id: formData.securityId || null,
        } as any, {
          onConflict: 'id'
        });

      if (profileError) {
        console.error('Profile upsert error:', profileError);
        toast({
          title: "Registration Failed",
          description: profileError.message || "Database error saving new user",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      toast({
        title: "Success",
        description: "Account created successfully! You can now log in.",
      });

      // Auto-login after registration
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password
      });

      if (signInError) {
        toast({
          title: "Login Required",
          description: "Please log in with your credentials",
        });
      }

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password
      });

      if (error) {
        toast({
          title: "Login Failed",
          description: error.message,
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      if (!data.user) {
        toast({
          title: "Login Failed",
          description: "Invalid credentials",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      // Fetch user profile (handle case where it may not exist yet)
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle();

      if (profileError) {
        toast({
          title: "Error",
          description: "Failed to load user profile",
          variant: "destructive"
        });
        setIsLoading(false);
        return;
      }

      // Expected role based on selected portal
      const roleMap: Record<string, string> = {
        'student': 'student',
        'classincharge': 'class_incharge',
        'coordinator': 'coordinator',
        'hod': 'hod',
        'principal': 'principal',
        'security': 'security'
      };
      const expectedRole = roleMap[role] || role;

      // Create a minimal profile if none exists yet
      let currentProfile = profile as any;
      if (!currentProfile) {
        const { data: inserted, error: insertError } = await supabase
          .from('profiles')
          .insert({
            id: data.user.id,
            email: data.user.email,
            full_name: (data.user.user_metadata?.full_name as string) || '',
            role: expectedRole as any
          } as any)
          .select('*')
          .maybeSingle();

        if (insertError || !inserted) {
          toast({
            title: "Error",
            description: "Failed to create user profile",
            variant: "destructive"
          });
          setIsLoading(false);
          return;
        }
        currentProfile = inserted;
      }

      // Verify role matches
      if (currentProfile.role !== expectedRole) {
        toast({
          title: "Access Denied",
          description: `This account is registered as ${currentProfile.role}, not ${expectedRole}`,
          variant: "destructive"
        });
        await supabase.auth.signOut();
        setIsLoading(false);
        return;
      }

      toast({
        title: "Success",
        description: "Logged in successfully!",
      });

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "An unexpected error occurred",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getRoleDisplayName = () => {
    const roleNames: Record<string, string> = {
      student: "Student",
      classincharge: "Class In-Charge", 
      coordinator: "Coordinator",
      hod: "HOD",
      principal: "Principal",
      security: "Security"
    };
    return roleNames[role] || role;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary-light/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Button 
          variant="ghost" 
          onClick={onBack} 
          className="mb-6 hover:bg-primary/10"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Role Selection
        </Button>

        <Card className="shadow-2xl border-0 bg-card/80 backdrop-blur-sm">
          <CardHeader className="text-center pb-2">
            <CardTitle className="text-2xl font-bold">
              {getRoleDisplayName()} Portal
            </CardTitle>
            <CardDescription>
              Access your dashboard and manage outpass requests
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="your.email@college.edu"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="Enter your password"
                      value={formData.password}
                      onChange={(e) => handleInputChange("password", e.target.value)}
                      required
                    />
                  </div>
                  
                  <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                    {isLoading ? "Logging in..." : "Login to Dashboard"}
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  {isStudent ? (
                    // Student Registration Form
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="email">Email</Label>
                          <Input
                            id="email"
                            type="email"
                            placeholder="your.email@college.edu"
                            value={formData.email}
                            onChange={(e) => handleInputChange("email", e.target.value)}
                            required
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="regNo">Registration No</Label>
                          <Input
                            id="regNo"
                            placeholder="REG2024001"
                            value={formData.regNo}
                            onChange={(e) => handleInputChange("regNo", e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="fullName">Full Name</Label>
                        <Input
                          id="fullName"
                          placeholder="Enter your full name"
                          value={formData.fullName}
                          onChange={(e) => handleInputChange("fullName", e.target.value)}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="photo">Upload Photo</Label>
                        <div className="flex items-center gap-2">
                          <Input
                            id="photo"
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoChange}
                            className="file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/80"
                          />
                          <Upload className="w-4 h-4 text-muted-foreground" />
                        </div>
                        {formData.photo && (
                          <p className="text-sm text-muted-foreground">
                            Selected: {formData.photo.name}
                          </p>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="dob">Date of Birth</Label>
                          <Input
                            id="dob"
                            type="date"
                            value={formData.dob}
                            onChange={(e) => handleInputChange("dob", e.target.value)}
                            required
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="dept">Department</Label>
                          <Select value={formData.dept} onValueChange={(value) => handleInputChange("dept", value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select department" />
                            </SelectTrigger>
                            <SelectContent>
                              {departments.map((dept) => (
                                <SelectItem key={dept} value={dept}>
                                  {dept}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="password">Password</Label>
                          <Input
                            id="password"
                            type="password"
                            placeholder="Create password"
                            value={formData.password}
                            onChange={(e) => handleInputChange("password", e.target.value)}
                            required
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="confirmPassword">Confirm Password</Label>
                          <Input
                            id="confirmPassword"
                            type="password"
                            placeholder="Confirm password"
                            value={formData.confirmPassword}
                            onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                            required
                          />
                        </div>
                      </div>
                    </>
                  ) : isFaculty ? (
                    // Faculty Registration Form
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="email">Email</Label>
                          <Input
                            id="email"
                            type="email"
                            placeholder="your.email@college.edu"
                            value={formData.email}
                            onChange={(e) => handleInputChange("email", e.target.value)}
                            required
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="employeeId">Employee ID</Label>
                          <Input
                            id="employeeId"
                            placeholder="EMP2024001"
                            value={formData.employeeId}
                            onChange={(e) => handleInputChange("employeeId", e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="fullName">Full Name</Label>
                        <Input
                          id="fullName"
                          placeholder="Enter your full name"
                          value={formData.fullName}
                          onChange={(e) => handleInputChange("fullName", e.target.value)}
                          required
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="dept">Department</Label>
                        <Select value={formData.dept} onValueChange={(value) => handleInputChange("dept", value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select department" />
                          </SelectTrigger>
                          <SelectContent>
                            {departments.map((dept) => (
                              <SelectItem key={dept} value={dept}>
                                {dept}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="year">Year</Label>
                          <Select value={formData.year} onValueChange={(value) => handleInputChange("year", value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select year" />
                            </SelectTrigger>
                            <SelectContent>
                              {years.map((year) => (
                                <SelectItem key={year} value={year}>
                                  {year}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                          <div className="space-y-2">
                            <Label htmlFor="section">Section</Label>
                            <Select 
                              value={formData.section} 
                              onValueChange={(value) => handleInputChange("section", value)}
                              disabled={!formData.dept || !formData.year}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select section" />
                              </SelectTrigger>
                              <SelectContent>
                                {getDepartmentSections(formData.dept, formData.year).map((section) => (
                                  <SelectItem key={section} value={section}>
                                    Section {section}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="password">Password</Label>
                          <Input
                            id="password"
                            type="password"
                            placeholder="Create password"
                            value={formData.password}
                            onChange={(e) => handleInputChange("password", e.target.value)}
                            required
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="confirmPassword">Confirm Password</Label>
                          <Input
                            id="confirmPassword"
                            type="password"
                            placeholder="Confirm password"
                            value={formData.confirmPassword}
                            onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                            required
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    // Security Registration Form
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="securityId">Security ID</Label>
                          <Input
                            id="securityId"
                            placeholder="SEC2024001"
                            value={formData.securityId}
                            onChange={(e) => handleInputChange("securityId", e.target.value)}
                            required
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="fullName">Full Name</Label>
                          <Input
                            id="fullName"
                            placeholder="Enter your full name"
                            value={formData.fullName}
                            onChange={(e) => handleInputChange("fullName", e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="Enter your email"
                          value={formData.email}
                          onChange={(e) => handleInputChange("email", e.target.value)}
                          required
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="phoneNumber">Phone Number</Label>
                        <Input
                          id="phoneNumber"
                          type="tel"
                          placeholder="Enter your phone number"
                          value={formData.phoneNumber}
                          onChange={(e) => handleInputChange("phoneNumber", e.target.value)}
                          required
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="password">Password</Label>
                          <Input
                            id="password"
                            type="password"
                            placeholder="Create password"
                            value={formData.password}
                            onChange={(e) => handleInputChange("password", e.target.value)}
                            required
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <Label htmlFor="confirmPassword">Confirm Password</Label>
                          <Input
                            id="confirmPassword"
                            type="password"
                            placeholder="Confirm password"
                            value={formData.confirmPassword}
                            onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                            required
                          />
                        </div>
                      </div>
                    </>
                  )}
                  
                  <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                    {isLoading ? "Creating Account..." : "Create Account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}