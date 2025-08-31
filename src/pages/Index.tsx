import { useState } from "react";
import LandingPage from "@/components/LandingPage";
import AuthForms from "@/components/AuthForms";
import StudentDashboard from "@/components/StudentDashboard";
import FacultyDashboard from "@/components/FacultyDashboard";
import SecurityDashboard from "@/components/SecurityDashboard";

type AppState = "landing" | "auth" | "dashboard";

const Index = () => {
  const [appState, setAppState] = useState<AppState>("landing");
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [userData, setUserData] = useState<any>(null);

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

  const handleLogout = () => {
    setAppState("landing");
    setSelectedRole("");
    setUserData(null);
  };

  const renderDashboard = () => {
    if (!userData) return null;

    switch (selectedRole) {
      case "student":
        return <StudentDashboard userData={userData} onLogout={handleLogout} />;
      case "classincharge":
      case "coordinator":
      case "hod":
      case "principal":
        return <FacultyDashboard userData={{ ...userData, role: selectedRole }} onLogout={handleLogout} />;
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