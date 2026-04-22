/**
 * QRScanner.tsx
 *
 * Camera-based QR code scanner using html5-qrcode.
 * Mounts a video preview, starts the camera on demand, and calls
 * onScan(decodedText) when a QR code is recognized.
 */

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Camera, CameraOff } from "lucide-react";

interface QRScannerProps {
  onScan: (decodedText: string) => void;
}

const SCANNER_ELEMENT_ID = "qr-scanner-region";

export default function QRScanner({ onScan }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopScanner = async () => {
    const instance = scannerRef.current;
    if (!instance) return;
    try {
      // isScanning guard prevents "Cannot stop, scanner is not running" errors
      // @ts-ignore — isScanning exists on the instance at runtime
      if (instance.isScanning) {
        await instance.stop();
      }
      await instance.clear();
    } catch {
      // ignore
    } finally {
      scannerRef.current = null;
    }
  };

  const startScanner = async () => {
    setError(null);
    try {
      const instance = new Html5Qrcode(SCANNER_ELEMENT_ID);
      scannerRef.current = instance;

      await instance.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          onScan(decodedText);
          // Stop after a successful scan to avoid duplicate triggers
          stopScanner().then(() => setActive(false));
        },
        () => {
          // per-frame decode failures — ignore to avoid noise
        }
      );
      setActive(true);
    } catch (err: any) {
      setError(
        err?.message ||
          "Unable to access camera. Please grant camera permission and try again."
      );
      setActive(false);
      scannerRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  const toggle = async () => {
    if (active) {
      await stopScanner();
      setActive(false);
    } else {
      await startScanner();
    }
  };

  return (
    <div className="space-y-3">
      <div
        id={SCANNER_ELEMENT_ID}
        className="w-full overflow-hidden rounded-lg border bg-muted/30"
        style={{ minHeight: active ? 250 : 0 }}
      />

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md p-2">
          {error}
        </div>
      )}

      <Button
        type="button"
        variant={active ? "outline" : "default"}
        onClick={toggle}
        className="w-full"
      >
        {active ? (
          <>
            <CameraOff className="w-4 h-4 mr-2" />
            Stop Camera
          </>
        ) : (
          <>
            <Camera className="w-4 h-4 mr-2" />
            Scan with Camera
          </>
        )}
      </Button>

      {active && (
        <p className="text-xs text-center text-muted-foreground">
          Point the camera at a student's outpass QR code
        </p>
      )}
    </div>
  );
}
