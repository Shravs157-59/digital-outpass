import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, Download, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface ParsedStudent {
  email: string;
  reg_no: string;
  department: string;
  year: string;
  section: string;
  full_name?: string;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

export default function BulkProfileImport() {
  const [parsedData, setParsedData] = useState<ParsedStudent[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const downloadTemplate = () => {
    const csvContent = "email,reg_no,department,year,section,full_name\nstudent@example.com,21A51A0501,CSE,3rd Year,A,John Doe\nstudent2@example.com,21A51A0502,ECE,2nd Year,B,Jane Smith";
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "student_profiles_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCSV = (text: string): ParsedStudent[] => {
    const lines = text.trim().split("\n");
    const headers = lines[0].toLowerCase().split(",").map(h => h.trim());
    
    const emailIdx = headers.indexOf("email");
    const regNoIdx = headers.indexOf("reg_no");
    const deptIdx = headers.indexOf("department");
    const yearIdx = headers.indexOf("year");
    const sectionIdx = headers.indexOf("section");
    const nameIdx = headers.indexOf("full_name");

    if (emailIdx === -1 || regNoIdx === -1 || deptIdx === -1 || yearIdx === -1 || sectionIdx === -1) {
      throw new Error("CSV must contain: email, reg_no, department, year, section columns");
    }

    return lines.slice(1).filter(line => line.trim()).map(line => {
      const values = line.split(",").map(v => v.trim());
      return {
        email: values[emailIdx] || "",
        reg_no: values[regNoIdx] || "",
        department: values[deptIdx] || "",
        year: values[yearIdx] || "",
        section: values[sectionIdx] || "",
        full_name: nameIdx !== -1 ? values[nameIdx] : undefined,
      };
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast({
        title: "Invalid File",
        description: "Please upload a CSV file",
        variant: "destructive",
      });
      return;
    }

    setFileName(file.name);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const data = parseCSV(text);
        
        if (data.length === 0) {
          throw new Error("No valid data found in CSV");
        }

        setParsedData(data);
        toast({
          title: "File Parsed",
          description: `Found ${data.length} student records ready to import`,
        });
      } catch (error: any) {
        toast({
          title: "Parse Error",
          description: error.message,
          variant: "destructive",
        });
        setParsedData([]);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (parsedData.length === 0) return;

    setImporting(true);
    setImportResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("bulk-update-profiles", {
        body: { students: parsedData },
      });

      if (error) {
        throw new Error(error.message || "Import failed");
      }

      setImportResult(data);
      
      if (data.success > 0) {
        toast({
          title: "Import Completed",
          description: `Successfully updated ${data.success} profiles. ${data.failed} failed.`,
        });
      } else {
        toast({
          title: "Import Failed",
          description: "No profiles were updated. Check the errors below.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      toast({
        title: "Import Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const clearData = () => {
    setParsedData([]);
    setFileName(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            Bulk Update Student Profiles
          </CardTitle>
          <CardDescription>
            Upload a CSV file to update missing student profile information (reg_no, department, year, section)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>CSV Format Required</AlertTitle>
            <AlertDescription>
              Your CSV must include columns: <strong>email, reg_no, department, year, section</strong>. 
              Optional: <strong>full_name</strong>. Download the template below.
            </AlertDescription>
          </Alert>

          <div className="flex gap-4">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-2" />
              Download Template
            </Button>

            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Button variant="default">
                <Upload className="w-4 h-4 mr-2" />
                Upload CSV
              </Button>
            </div>

            {parsedData.length > 0 && (
              <Button variant="ghost" onClick={clearData}>
                Clear
              </Button>
            )}
          </div>

          {fileName && (
            <p className="text-sm text-muted-foreground">
              Selected file: <strong>{fileName}</strong>
            </p>
          )}
        </CardContent>
      </Card>

      {parsedData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Preview ({parsedData.length} records)</CardTitle>
            <CardDescription>
              Review the data before importing. Students will be matched by email address.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px] border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Roll Number</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Year</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead>Name</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.map((student, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">{student.email}</TableCell>
                      <TableCell>{student.reg_no}</TableCell>
                      <TableCell>{student.department}</TableCell>
                      <TableCell>{student.year}</TableCell>
                      <TableCell>{student.section}</TableCell>
                      <TableCell>{student.full_name || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="flex justify-end mt-4">
              <Button onClick={handleImport} disabled={importing} size="lg">
                {importing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Import {parsedData.length} Profiles
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {importResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {importResult.success > 0 ? (
                <CheckCircle className="w-5 h-5 text-success" />
              ) : (
                <AlertCircle className="w-5 h-5 text-destructive" />
              )}
              Import Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Badge variant="default" className="text-lg px-4 py-2">
                {importResult.success} Updated
              </Badge>
              {importResult.failed > 0 && (
                <Badge variant="destructive" className="text-lg px-4 py-2">
                  {importResult.failed} Failed
                </Badge>
              )}
            </div>

            {importResult.errors.length > 0 && (
              <div className="space-y-2">
                <p className="font-medium text-destructive">Errors:</p>
                <ScrollArea className="h-[150px] border rounded-md p-3">
                  {importResult.errors.map((error, index) => (
                    <p key={index} className="text-sm text-muted-foreground">
                      • {error}
                    </p>
                  ))}
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
