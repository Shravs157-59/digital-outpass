/**
 * Index.tsx — Main page component (app entry point)
 * 
 * TYPESCRIPT CONCEPTS:
 * 
 * 1. TYPE ALIAS — "type AppState = ..." creates a custom type name.
 *    Unlike "interface", "type" can define unions, primitives, etc.
 *    Example: type AppState = "landing" | "auth" | "dashboard"
 *    This means AppState can ONLY be one of these three exact strings.
 * 
 * 2. IMPORTED TYPES — "import { Session } from '@supabase/supabase-js'"
 *    Session is a TypeScript type from the Supabase library that describes
 *    what a user session object looks like.
 * 
 * 3. STATE with UNION TYPES:
 *    useState<Session | null>(null) — session is either a Session object or null.
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";  // Importing a TYPE from a library
import LandingPage from "@/components/LandingPage";
import AuthForms from "@/components/AuthForms";
import StudentDashboard from "@/components/StudentDashboard";
import FacultyDashboard from "@/components/FacultyDashboard";
import SecurityDashboard from "@/components/SecurityDashboard";
import { useToast } from "@/hooks/use-toast";

/**
 * TYPE ALIAS — Creates a custom type that can ONLY be one of these literal strings.
 * If you try: setAppState("home") — TypeScript will show an error!
 * In plain JS, you'd just use a string variable with no restriction.
 */
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
      (event, session) => {
        setSession(session);
        
        if (session?.user) {
          // Defer profile fetching to avoid race condition
          setTimeout(async () => {
            const { data: profile, error } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .maybeSingle();
            
            if (error) {
              console.error('Profile fetch error:', error);
              toast({
                title: "Error",
                description: "Failed to load user profile",
                variant: "destructive"
              });
              return;
            }

            if (profile) {
              setUserData(profile);
              setSelectedRole(profile.role);
              setAppState("dashboard");
            } else {
              console.log('Profile not found yet, waiting...');
              // Profile might not exist yet, stay on current screen
            }
          }, 500);
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
          .maybeSingle()
          .then(({ data: profile, error }) => {
            if (error) {
              console.error('Profile fetch error:', error);
              toast({
                title: "Error",
                description: "Failed to load user profile",
                variant: "destructive"
              });
              return;
            }

            if (profile) {
              setUserData(profile);
              setSelectedRole(profile.role);
              setAppState("dashboard");
            }
          });
      }
    });

    return () => subscription.unsubscribe();
  }, [toast]);

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
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error('Logout error:', error);
      }
    } catch (error) {
      console.error('Logout exception:', error);
    } finally {
      // Always clear state regardless of signOut result
      // If signOut fails, session is likely already invalid
      setAppState("landing");
      setSelectedRole("");
      setUserData(null);
      setSession(null);
      
      toast({
        title: "Success",
        description: "Logged out successfully",
      });
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