import { useEffect, useRef } from 'react';

interface HMRErrorDetectorProps {
  iframeRef: React.RefObject<HTMLIFrameElement>;
  onErrorDetected: (errors: Array<{ type: string; message: string; package?: string }>) => void;
}

export default function HMRErrorDetector({ iframeRef, onErrorDetected }: HMRErrorDetectorProps) {
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkForHMRErrors = () => {
      if (!iframeRef.current) return;

      try {
        const iframeDoc = iframeRef.current.contentDocument;
        if (!iframeDoc) return;

        // Check for Vite error overlay
        const errorOverlay = iframeDoc.querySelector('vite-error-overlay');
        if (errorOverlay) {
          // Try to extract error message
          const messageElement = errorOverlay.shadowRoot?.querySelector('.message-body');
          if (messageElement) {
            const errorText = messageElement.textContent || '';
            
            // Parse various types of local development errors
            const importMatch = errorText.match(/Failed to resolve import "([^"]+)"/);
            const syntaxMatch = errorText.match(/SyntaxError/);
            const viteMatch = errorText.match(/Vite/);
            const portMatch = errorText.match(/EADDRINUSE.*:(\d+)/);
            
            if (importMatch) {
              const packageName = importMatch[1];
              if (!packageName.startsWith('.')) {
                // Extract base package name
                let finalPackage = packageName;
                if (packageName.startsWith('@')) {
                  const parts = packageName.split('/');
                  finalPackage = parts.length >= 2 ? parts.slice(0, 2).join('/') : packageName;
                } else {
                  finalPackage = packageName.split('/')[0];
                }

                onErrorDetected([{
                  type: 'npm-missing',
                  message: `Missing package "${packageName}" - Click 'Install Packages' above or run 'npm install ${finalPackage}' in your terminal`,
                  package: finalPackage
                }]);
              }
            } else if (portMatch) {
              const port = portMatch[1];
              onErrorDetected([{
                type: 'port-conflict',
                message: `Port ${port} is already in use. Please stop other development servers or use a different port.`
              }]);
            } else if (syntaxMatch) {
              onErrorDetected([{
                type: 'syntax-error',
                message: 'Syntax error detected in your code. Please check the file content and fix any syntax issues.'
              }]);
            } else if (viteMatch) {
              onErrorDetected([{
                type: 'vite-error',
                message: 'Vite development server error. Try restarting the server with "npm run dev".'
              }]);
            }
          }
        }
      } catch (error) {
        // Cross-origin errors are expected, ignore them
      }
    };

    // Check immediately and then every 2 seconds
    checkForHMRErrors();
    checkIntervalRef.current = setInterval(checkForHMRErrors, 2000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [iframeRef, onErrorDetected]);

  return null;
}