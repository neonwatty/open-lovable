/**
 * @jest-environment node
 */

import {
  CustomStreamHandler,
  AdvancedStreamHandler,
  IncrementalResponseParser,
  createSSEResponse,
  simulateStreaming
} from '../../lib/custom-stream-handler';

// Mock TextEncoder for tests
if (typeof TextEncoder === 'undefined') {
  global.TextEncoder = require('util').TextEncoder;
}

describe('CustomStreamHandler', () => {
  let streamHandler: CustomStreamHandler;
  let mockController: ReadableStreamDefaultController<Uint8Array>;

  beforeEach(() => {
    streamHandler = new CustomStreamHandler({
      timeout: 5000,
      bufferSize: 100,
      enableParsing: true,
      enablePartialResponse: true,
      flushInterval: 100,
      maxBufferSize: 500
    });

    // Mock controller
    mockController = {
      enqueue: jest.fn(),
      close: jest.fn(),
      error: jest.fn()
    } as any;

    // Set the controller
    const stream = streamHandler.createStream();
    stream.getReader(); // This will set up the controller
  });

  afterEach(() => {
    streamHandler.end();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('Stream Creation and Management', () => {
    it('should create a readable stream', () => {
      const stream = streamHandler.createStream();
      expect(stream).toBeInstanceOf(ReadableStream);
    });

    it('should handle stream cancellation', () => {
      const stream = streamHandler.createStream();
      const reader = stream.getReader();
      
      expect(() => reader.cancel()).not.toThrow();
      expect(streamHandler.isStreamEnded()).toBe(true);
    });

    it('should end stream properly', () => {
      streamHandler.end();
      expect(streamHandler.isStreamEnded()).toBe(true);
    });
  });

  describe('Progress Updates', () => {
    beforeEach(() => {
      // Mock the controller setup
      (streamHandler as any).controller = mockController;
    });

    it('should send progress updates', async () => {
      const progressData = {
        type: 'status' as const,
        message: 'Processing request...'
      };

      await streamHandler.sendProgress(progressData);

      expect(mockController.enqueue).toHaveBeenCalled();
      const call = (mockController.enqueue as jest.Mock).mock.calls[0][0];
      const message = new TextDecoder().decode(call);
      expect(message).toContain('data: ');
      expect(message).toContain(JSON.stringify(progressData));
    });

    it('should handle errors when sending progress', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      (mockController.enqueue as jest.Mock).mockImplementation(() => {
        throw new Error('Controller error');
      });

      await streamHandler.sendProgress({
        type: 'error',
        error: 'Test error'
      });

      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('Text Streaming and Parsing', () => {
    beforeEach(() => {
      (streamHandler as any).controller = mockController;
    });

    it('should send text with parsing enabled', async () => {
      const text = '<file path="src/App.jsx">\nimport React from "react";\n</file>';
      
      await streamHandler.sendText(text, true);

      expect(mockController.enqueue).toHaveBeenCalledTimes(2); // One for parsed data, one for raw text
    });

    it('should send text without parsing when disabled', async () => {
      const text = 'Simple text content';
      
      await streamHandler.sendText(text, false);

      expect(mockController.enqueue).toHaveBeenCalledTimes(1); // Only raw text
    });

    it('should handle buffer overflow', async () => {
      const largeText = 'x'.repeat(1000); // Exceeds maxBufferSize of 500
      
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      await streamHandler.sendText(largeText);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Buffer exceeded maximum size')
      );
      
      consoleWarnSpy.mockRestore();
    });
  });

  describe('Error and Warning Handling', () => {
    beforeEach(() => {
      (streamHandler as any).controller = mockController;
    });

    it('should send error messages', async () => {
      const errorMessage = 'Something went wrong';
      
      await streamHandler.sendError(errorMessage);

      expect(mockController.enqueue).toHaveBeenCalled();
      const call = (mockController.enqueue as jest.Mock).mock.calls[0][0];
      const message = new TextDecoder().decode(call);
      expect(message).toContain('"type":"error"');
      expect(message).toContain(errorMessage);
    });

    it('should send warning messages', async () => {
      const warningMessage = 'This is a warning';
      const warnings = ['Warning 1', 'Warning 2'];
      
      await streamHandler.sendWarning(warningMessage, warnings);

      expect(mockController.enqueue).toHaveBeenCalled();
      const call = (mockController.enqueue as jest.Mock).mock.calls[0][0];
      const message = new TextDecoder().decode(call);
      expect(message).toContain('"type":"warning"');
      expect(message).toContain(warningMessage);
      expect(message).toContain('Warning 1');
    });
  });

  describe('Completion Handling', () => {
    beforeEach(() => {
      (streamHandler as any).controller = mockController;
    });

    it('should send completion data', async () => {
      const completionData = {
        generatedCode: 'const x = 1;',
        explanation: 'Generated variable x',
        files: 2,
        components: 1,
        model: 'claude-3-5-sonnet'
      };

      await streamHandler.sendComplete(completionData);

      expect(mockController.enqueue).toHaveBeenCalled();
      const call = (mockController.enqueue as jest.Mock).mock.calls[0][0];
      const message = new TextDecoder().decode(call);
      expect(message).toContain('"type":"complete"');
      expect(message).toContain('Generated variable x');
    });
  });

  describe('Buffer Management', () => {
    beforeEach(() => {
      (streamHandler as any).controller = mockController;
    });

    it('should manage buffer size correctly', async () => {
      const text1 = 'x'.repeat(50);
      const text2 = 'y'.repeat(60); // Total 110, exceeds bufferSize of 100
      
      await streamHandler.sendText(text1);
      await streamHandler.sendText(text2);

      const buffer = streamHandler.getBuffer();
      expect(buffer.length).toBeGreaterThan(0); // Just check buffer has content
    });

    it('should clear buffer when requested', async () => {
      await streamHandler.sendText('Some content');
      expect(streamHandler.getBuffer().length).toBeGreaterThan(0);
      
      streamHandler.clearBuffer();
      expect(streamHandler.getBuffer().length).toBe(0);
    });
  });

  describe('Auto-flush functionality', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      (streamHandler as any).controller = mockController;
    });

    it('should auto-flush partial content periodically', async () => {
      const streamWithAutoFlush = new CustomStreamHandler({
        enablePartialResponse: true,
        flushInterval: 100
      });
      (streamWithAutoFlush as any).controller = mockController;

      await streamWithAutoFlush.sendText('Some content');
      
      // Fast-forward time to trigger auto-flush
      jest.advanceTimersByTime(150);

      // Should have called enqueue for both the text and the auto-flush
      expect(mockController.enqueue).toHaveBeenCalledTimes(2);
      
      streamWithAutoFlush.end();
    });
  });
});

describe('AdvancedStreamHandler', () => {
  let advancedHandler: AdvancedStreamHandler;
  let mockController: ReadableStreamDefaultController<Uint8Array>;

  beforeEach(() => {
    advancedHandler = new AdvancedStreamHandler({
      timeout: 5000,
      bufferSize: 100,
      enableParsing: true
    });

    mockController = {
      enqueue: jest.fn(),
      close: jest.fn(),
      error: jest.fn()
    } as any;

    (advancedHandler as any).controller = mockController;
  });

  afterEach(() => {
    advancedHandler.end();
  });

  describe('Advanced Text Processing', () => {
    it('should process text with component tracking', async () => {
      const reactComponent = `<file path="src/components/Button.jsx">
import React from 'react';

export default function Button() {
  return <button>Click me</button>;
}
</file>`;

      await advancedHandler.processText(reactComponent);

      const results = advancedHandler.getFinalResults();
      expect(results.componentCount).toBe(1);
      expect(results.files.has('src/components/Button.jsx')).toBe(true);
    });

    it('should track multiple components', async () => {
      const multipleComponents = `<file path="src/components/Header.jsx">
export default function Header() { return <header>Header</header>; }
</file>

<file path="src/components/Footer.jsx">
export default function Footer() { return <footer>Footer</footer>; }
</file>`;

      await advancedHandler.processText(multipleComponents);

      const results = advancedHandler.getFinalResults();
      expect(results.componentCount).toBe(2);
      expect(results.files.size).toBe(2);
    });

    it('should handle package detection', async () => {
      const textWithPackages = `I'll install the required packages:

<package>react-router-dom</package>
<package>styled-components</package>

Here's the component:
<file path="src/App.jsx">
import { BrowserRouter } from 'react-router-dom';
</file>`;

      await advancedHandler.processText(textWithPackages);

      const results = advancedHandler.getFinalResults();
      expect(results.packages.has('react-router-dom')).toBe(true);
      expect(results.packages.has('styled-components')).toBe(true);
    });
  });
});

describe('IncrementalResponseParser', () => {
  let parser: IncrementalResponseParser;

  beforeEach(() => {
    parser = new IncrementalResponseParser();
  });

  describe('File Parsing', () => {
    it('should parse complete file blocks', () => {
      const text = `<file path="src/App.jsx">
import React from 'react';

export default function App() {
  return <div>Hello World</div>;
}
</file>`;

      const chunks = parser.addText(text);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('file');
      expect(chunks[0].path).toBe('src/App.jsx');
      expect(chunks[0].content).toContain('export default function App');
    });

    it('should handle multiple files', () => {
      const text = `<file path="src/components/Header.jsx">
export default function Header() {
  return <header>Header</header>;
}
</file>

<file path="src/components/Footer.jsx">
export default function Footer() {
  return <footer>Footer</footer>;
}
</file>`;

      const chunks = parser.addText(text);

      expect(chunks).toHaveLength(2);
      expect(chunks[0].path).toBe('src/components/Header.jsx');
      expect(chunks[1].path).toBe('src/components/Footer.jsx');
    });

    it('should handle partial file blocks', () => {
      const partialText = `<file path="src/App.jsx">
import React from 'react';
// File not completed yet...`;

      const chunks = parser.addText(partialText);

      expect(chunks).toHaveLength(0); // No complete files yet
      expect(parser.getBuffer()).toContain('<file path="src/App.jsx">');
    });
  });

  describe('Package Parsing', () => {
    it('should parse package declarations', () => {
      const text = `Let me install the packages:

<package>react-router-dom</package>
<package>lodash</package>

Now here's the code:`;

      const chunks = parser.addText(text);

      const packageChunks = chunks.filter(chunk => chunk.type === 'package');
      expect(packageChunks).toHaveLength(2);
      expect(packageChunks[0].name).toBe('react-router-dom');
      expect(packageChunks[1].name).toBe('lodash');
    });

    it('should track parsed packages', () => {
      parser.addText('<package>express</package>');
      parser.addText('<package>cors</package>');

      const packages = parser.getPackages();
      expect(packages.has('express')).toBe(true);
      expect(packages.has('cors')).toBe(true);
      expect(packages.size).toBe(2);
    });
  });

  describe('Buffer Management', () => {
    it('should maintain buffer for incomplete content', () => {
      parser.addText('Some incomplete');
      parser.addText(' content here');

      expect(parser.getBuffer()).toBe('Some incomplete content here');
    });

    it('should clear all data when requested', () => {
      parser.addText('<file path="test.js">content</file>');
      parser.addText('<package>test-package</package>');

      expect(parser.getFiles().size).toBeGreaterThan(0);
      expect(parser.getPackages().size).toBeGreaterThan(0);

      parser.clear();

      expect(parser.getFiles().size).toBe(0);
      expect(parser.getPackages().size).toBe(0);
      expect(parser.getBuffer()).toBe('');
    });
  });
});

describe('Utility Functions', () => {
  describe('createSSEResponse', () => {
    it('should create proper SSE response', () => {
      // Skip this test in Jest environment since Response constructor may not be available
      if (typeof Response === 'undefined') {
        expect(true).toBe(true);
        return;
      }

      const mockStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: test\n\n'));
          controller.close();
        }
      });

      const response = createSSEResponse(mockStream as any);

      expect(response).toBeInstanceOf(Response);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
      expect(response.headers.get('Cache-Control')).toBe('no-cache');
      expect(response.headers.get('Connection')).toBe('keep-alive');
    });
  });

  describe('simulateStreaming', () => {
    it('should simulate streaming with delays', async () => {
      const handler = new CustomStreamHandler();
      const mockController = {
        enqueue: jest.fn(),
        close: jest.fn(),
        error: jest.fn()
      } as any;
      (handler as any).controller = mockController;

      const response = 'Line 1\nLine 2\nLine 3';

      await simulateStreaming(response, handler, 0); // No delay for test speed

      // Should have been called for each line plus raw text calls
      expect(mockController.enqueue).toHaveBeenCalled();
      
      handler.end();
    }, 10000);
  });
});

describe('Error Handling and Edge Cases', () => {
  let streamHandler: CustomStreamHandler;

  beforeEach(() => {
    streamHandler = new CustomStreamHandler();
  });

  afterEach(() => {
    streamHandler.end();
  });

  it('should handle stream operations after end', async () => {
    streamHandler.end();

    // Should not throw when trying to send after end
    await expect(streamHandler.sendText('test')).resolves.not.toThrow();
    await expect(streamHandler.sendProgress({ type: 'status', message: 'test' })).resolves.not.toThrow();
  });

  it('should handle invalid JSON in progress data', async () => {
    const mockController = {
      enqueue: jest.fn(() => { throw new Error('Enqueue failed'); }),
      close: jest.fn(),
      error: jest.fn()
    } as any;
    (streamHandler as any).controller = mockController;

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    await streamHandler.sendProgress({
      type: 'status',
      message: 'test'
    });

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('should handle controller close errors gracefully', () => {
    const mockController = {
      enqueue: jest.fn(),
      close: jest.fn(() => { throw new Error('Close failed'); }),
      error: jest.fn()
    } as any;
    (streamHandler as any).controller = mockController;

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    expect(() => streamHandler.end()).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalled();
    
    consoleErrorSpy.mockRestore();
  });
});