import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, Users, UserCheck, Crown, Shield, User } from "lucide-react";
import collegeLogo from "@/assets/lendi-logo.png";

interface Role {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  color: string;
}

const roles: Role[] = [
  {
    id: "student",
    name: "Student",
    icon: <GraduationCap className="w-8 h-8" />,
    description: "Apply for outpass and track status",
    color: "text-primary"
  },
  {
    id: "classincharge",
    name: "Class In-Charge",
    icon: <User className="w-8 h-8" />,
    description: "Review and approve student requests",
    color: "text-success"
  },
  {
    id: "coordinator",
    name: "Coordinator",
    icon: <Users className="w-8 h-8" />,
    description: "Coordinate approval process",
    color: "text-accent"
  },
  {
    id: "hod",
    name: "HOD",
    icon: <UserCheck className="w-8 h-8" />,
    description: "Handle special cases and analytics",
    color: "text-warning"
  },
  {
    id: "principal",
    name: "Principal",
    icon: <Crown className="w-8 h-8" />,
    description: "Final authority and oversight",
    color: "text-destructive"
  },
  {
    id: "security",
    name: "Security",
    icon: <Shield className="w-8 h-8" />,
    description: "QR scanning and entry/exit logging",
    color: "text-primary-glow"
  }
];

interface LandingPageProps {
  onRoleSelect: (role: string) => void;
}

export default function LandingPage({ onRoleSelect }: LandingPageProps) {
  const [showRoleDialog, setShowRoleDialog] = useState(false);

  const handleRoleSelect = (roleId: string) => {
    setShowRoleDialog(false);
    onRoleSelect(roleId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary via-primary-glow to-primary relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-20 w-64 h-64 bg-white rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-primary-light rounded-full blur-3xl"></div>
      </div>
      
      <div className="relative z-10 min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-4xl mx-auto">
          {/* College Logo and Name */}
          <div className="mb-12 animate-fade-in">
            <img 
              src={collegeLogo} 
              alt="College Logo" 
              className="w-32 h-24 mx-auto mb-6 drop-shadow-2xl"
            />
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
              LENDI INSTITUTE OF ENGINEERING AND TECHNOLOGY
            </h1>
            <h2 className="text-3xl md:text-4xl font-semibold text-primary-light mb-6">
              Digital Outpass Approval System
            </h2>
            <p className="text-xl text-primary-light/90 max-w-2xl mx-auto leading-relaxed">
              Streamlined digital outpass approval system for seamless campus exit management
            </p>
          </div>

          {/* CTA Button */}
          <Button 
            variant="hero" 
            size="xl" 
            onClick={() => setShowRoleDialog(true)}
            className="animate-bounce-subtle"
          >
            Register / Login
          </Button>
        </div>
      </div>

      {/* Role Selection Dialog */}
      <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-center mb-6">
              Select Your Role
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roles.map((role) => (
              <Card 
                key={role.id} 
                className="cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-2 hover:border-primary"
                onClick={() => handleRoleSelect(role.id)}
              >
                <CardContent className="p-6 text-center">
                  <div className={`${role.color} mb-4 flex justify-center`}>
                    {role.icon}
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{role.name}</h3>
                  <p className="text-muted-foreground text-sm">{role.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}