import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import LandingPage from "@/components/LandingPage";
import AuthForms from "@/components/AuthForms";
import StudentDashboard from "@/components/StudentDashboard";
import FacultyDashboard from "@/components/FacultyDashboard";
import SecurityDashboard from "@/components/SecurityDashboard";
import { useToast } from "@/hooks/use-toast";

type AppState = "landing" | "auth" | "dashboard";

const Index = () => {
  const [appState, setAppState] = useState<AppState>("landing");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [userData, setUserData] = useState<any>(null);
  const [session, setSession] = useState<Session | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setSession(session);
        
        if (session?.user) {
          // Fetch user profile
          const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();
          
          if (profile && !error) {
            setUserData(profile);
            setSelectedRole(profile.role);
            setAppState("dashboard");
          }
        } else {
          setUserData(null);
          setAppState("landing");
        }
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        supabase
          .from('profiles')
          .select('*')
          .eq('id', session.user.id)
          .single()
          .then(({ data: profile }) => {
            if (profile) {
              setUserData(profile);
              setSelectedRole(profile.role);
              setAppState("dashboard");
            }
          });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleRoleSelect = (role: string) => {
    setSelectedRole(role);
    setAppState("auth");
  };

  const handleAuth = (userData: any) => {
    setUserData(userData);
    setAppState("dashboard");
  };

  const handleBackToRoleSelection = () => {
    setAppState("landing");
    setSelectedRole("");
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error",
        description: "Failed to logout",
        variant: "destructive"
      });
    } else {
      setAppState("landing");
      setSelectedRole("");
      setUserData(null);
      setSession(null);
    }
  };

  const renderDashboard = () => {
    if (!userData) return null;

    switch (userData.role || selectedRole) {
      case "student":
        return <StudentDashboard userData={userData} onLogout={handleLogout} />;
      case "class_incharge":
      case "coordinator":
      case "hod":
      case "principal":
        return <FacultyDashboard userData={userData} onLogout={handleLogout} />;
      case "security":
        return <SecurityDashboard userData={userData} onLogout={handleLogout} />;
      default:
        return <StudentDashboard userData={userData} onLogout={handleLogout} />;
    }
  };

  return (
    <>
      {appState === "landing" && (
        <LandingPage onRoleSelect={handleRoleSelect} />
      )}
      
      {appState === "auth" && (
        <AuthForms 
          role={selectedRole} 
          onBack={handleBackToRoleSelection}
          onAuth={handleAuth}
        />
      )}
      
      {appState === "dashboard" && renderDashboard()}
    </>
  );
};

export default Index;