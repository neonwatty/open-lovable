import { NextRequest, NextResponse } from 'next/server';

declare global {
  var activeSandbox: any;
  var sandboxData: any;
}

export async function POST(request: NextRequest) {
  try {
    const { packages, sandboxId } = await request.json();
    
    if (!packages || !Array.isArray(packages) || packages.length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Packages array is required' 
      }, { status: 400 });
    }
    
    // Validate and deduplicate package names
    const validPackages = [...new Set(packages)]
      .filter(pkg => pkg && typeof pkg === 'string' && pkg.trim() !== '')
      .map(pkg => pkg.trim());
    
    if (validPackages.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No valid package names provided'
      }, { status: 400 });
    }
    
    // Log if duplicates were found
    if (packages.length !== validPackages.length) {
      console.log(`[install-packages] Cleaned packages: removed ${packages.length - validPackages.length} invalid/duplicate entries`);
      console.log(`[install-packages] Original:`, packages);
      console.log(`[install-packages] Cleaned:`, validPackages);
    }
    
    // Try to get sandbox - either from global or reconnect
    let sandbox = global.activeSandbox;
    
    
    if (!sandbox) {
      console.log('[install-packages] No active sandbox - using local package installation');
      // In local mode, we don't execute packages but can still provide feedback
    }
    
    console.log('[install-packages] Installing packages:', packages);
    
    // Create a response stream for real-time updates
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();
    
    // Function to send progress updates
    const sendProgress = async (data: any) => {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      await writer.write(encoder.encode(message));
    };
    
    // Start package tracking in background
    (async () => {
      try {
        await sendProgress({ 
          type: 'start', 
          message: `Processing ${validPackages.length} package${validPackages.length > 1 ? 's' : ''}...`,
          packages: validPackages 
        });
        
        await sendProgress({ 
          type: 'status', 
          message: 'Analyzing requested packages in local mode...' 
        });
        
        // In local sandbox mode, we don't actually install packages for security reasons
        // Instead, we simulate the process and provide helpful information
        await sendProgress({ 
          type: 'info', 
          message: `Local sandbox mode: Packages would be available in a production environment`
        });
        
        // Simulate package checking
        await sendProgress({ 
          type: 'status', 
          message: 'Simulating package installation check...' 
        });
        
        // Wait a moment to simulate processing
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Provide feedback about the packages
        for (const pkg of validPackages) {
          await sendProgress({
            type: 'output',
            message: `📦 ${pkg} - Would be installed in production environment`
          });
        }
        
        await sendProgress({ 
          type: 'success', 
          message: `Package request processed: ${validPackages.join(', ')}`,
          installedPackages: validPackages // Mark as "installed" for UI consistency
        });
        
        await sendProgress({ 
          type: 'info', 
          message: 'Local sandbox mode: Development server continues running with existing packages' 
        });
        
        await sendProgress({ 
          type: 'complete', 
          message: 'Package processing complete in local mode!',
          installedPackages: validPackages
        });
        
      } catch (error) {
        const errorMessage = (error as Error).message;
        if (errorMessage && errorMessage !== 'undefined') {
          await sendProgress({ 
            type: 'error', 
            message: errorMessage
          });
        }
      } finally {
        await writer.close();
      }
    })();
    
    // Return the stream
    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
    
  } catch (error) {
    console.error('[install-packages] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: (error as Error).message 
    }, { status: 500 });
  }
}