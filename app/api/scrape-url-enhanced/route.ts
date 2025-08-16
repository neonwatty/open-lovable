import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import TurndownService from 'turndown';
import puppeteer from 'puppeteer';

// Function to sanitize smart quotes and other problematic characters
function sanitizeQuotes(text: string): string {
  return text
    // Replace smart single quotes
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    // Replace smart double quotes
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    // Replace other quote-like characters
    .replace(/[\u00AB\u00BB]/g, '"') // Guillemets
    .replace(/[\u2039\u203A]/g, "'") // Single guillemets
    // Replace other problematic characters
    .replace(/[\u2013\u2014]/g, '-') // En dash and em dash
    .replace(/[\u2026]/g, '...') // Ellipsis
    .replace(/[\u00A0]/g, ' '); // Non-breaking space
}

// Function to fetch HTML content using native fetch
async function fetchHtmlContent(url: string, useJavaScript = false): Promise<{
  html: string;
  title: string;
  description: string;
  screenshot?: string;
}> {
  if (useJavaScript) {
    // Use Puppeteer for JavaScript-rendered content
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      
      // Set timeout and wait for network idle
      await page.goto(url, { 
        waitUntil: 'networkidle2',
        timeout: 30000 
      });
      
      // Wait for additional JavaScript rendering
      await page.waitForFunction(() => document.readyState === 'complete', { timeout: 5000 });
      
      const html = await page.content();
      const title = await page.title();
      
      // Get meta description
      const description = await page.evaluate(() => {
        const metaDescription = document.querySelector('meta[name="description"]');
        return metaDescription ? metaDescription.getAttribute('content') || '' : '';
      });
      
      // Take a screenshot for visual reference
      const screenshot = await page.screenshot({ 
        encoding: 'base64',
        fullPage: false,
        type: 'png'
      });
      
      return {
        html,
        title,
        description,
        screenshot: `data:image/png;base64,${screenshot}`
      };
    } finally {
      await browser.close();
    }
  } else {
    // Use basic fetch for static content
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const html = await response.text();
      const $ = cheerio.load(html);
      
      const title = $('title').text().trim() || $('h1').first().text().trim() || '';
      const description = $('meta[name="description"]').attr('content') || 
                         $('meta[property="og:description"]').attr('content') || '';
      
      return {
        html,
        title,
        description
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

// Function to convert HTML to clean markdown
function convertHtmlToMarkdown(html: string): string {
  const $ = cheerio.load(html);
  
  // Remove script tags, style tags, and other unwanted elements
  $('script, style, nav, header, footer, aside, .sidebar, .nav, .menu, .advertisement, .ads').remove();
  
  // Remove comments
  $('*').contents().filter(function(this: any) {
    return this.nodeType === 8; // Comment nodes
  }).remove();
  
  // Get the main content area
  let contentHtml = '';
  const contentSelectors = [
    'main',
    '[role="main"]',
    '.main-content',
    '.content',
    '.post-content',
    '.entry-content',
    'article',
    '.article-content'
  ];
  
  for (const selector of contentSelectors) {
    const content = $(selector);
    if (content.length > 0 && content.text().trim().length > 100) {
      contentHtml = content.html() || '';
      break;
    }
  }
  
  // Fallback to body if no main content found
  if (!contentHtml) {
    contentHtml = $('body').html() || html;
  }
  
  // Configure turndown service
  const turndownService = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**'
  });
  
  // Add custom rules
  turndownService.addRule('removeEmptyElements', {
    filter: function (node) {
      return node.textContent?.trim() === '' && !['img', 'br', 'hr'].includes(node.nodeName.toLowerCase());
    },
    replacement: function () {
      return '';
    }
  });
  
  const markdown = turndownService.turndown(contentHtml);
  
  // Clean up the markdown
  return markdown
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive newlines
    .replace(/^\s+|\s+$/g, '') // Trim whitespace
    .replace(/\[!\[.*?\]\(.*?\)\]\(.*?\)/g, '') // Remove nested image links
    .trim();
}

export async function POST(request: NextRequest) {
  try {
    const { url, useJavaScript = false } = await request.json();
    
    if (!url) {
      return NextResponse.json({
        success: false,
        error: 'URL is required'
      }, { status: 400 });
    }
    
    // Validate URL format
    try {
      new URL(url);
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Invalid URL format'
      }, { status: 400 });
    }
    
    console.log('[scrape-url-enhanced] Scraping with built-in scraper:', url, { useJavaScript });
    
    // Fetch HTML content
    const { html, title, description, screenshot } = await fetchHtmlContent(url, useJavaScript);
    
    // Convert HTML to markdown
    const markdown = convertHtmlToMarkdown(html);
    
    // Sanitize the markdown content
    const sanitizedMarkdown = sanitizeQuotes(markdown);
    const sanitizedTitle = sanitizeQuotes(title);
    const sanitizedDescription = sanitizeQuotes(description);
    
    // Format content for AI
    const formattedContent = `
Title: ${sanitizedTitle}
Description: ${sanitizedDescription}
URL: ${url}

Main Content:
${sanitizedMarkdown}
    `.trim();
    
    const response = {
      success: true,
      url,
      content: formattedContent,
      structured: {
        title: sanitizedTitle,
        description: sanitizedDescription,
        content: sanitizedMarkdown,
        url
      },
      metadata: {
        scraper: useJavaScript ? 'puppeteer-builtin' : 'fetch-builtin',
        timestamp: new Date().toISOString(),
        contentLength: formattedContent.length,
        useJavaScript,
        htmlLength: html.length
      },
      message: `URL scraped successfully with built-in ${useJavaScript ? 'Puppeteer' : 'fetch'} scraper`
    } as any;
    
    // Add screenshot if available
    if (screenshot) {
      response.screenshot = screenshot;
      response.metadata.hasScreenshot = true;
    }
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('[scrape-url-enhanced] Error:', error);
    
    // Provide more specific error messages
    let errorMessage = (error as Error).message;
    if (errorMessage.includes('net::ERR_NAME_NOT_RESOLVED')) {
      errorMessage = 'Could not resolve domain name. Please check the URL.';
    } else if (errorMessage.includes('net::ERR_CONNECTION_REFUSED')) {
      errorMessage = 'Connection refused. The server may be down.';
    } else if (errorMessage.includes('TimeoutError')) {
      errorMessage = 'Request timed out. The website may be slow to respond.';
    } else if (errorMessage.includes('AbortError')) {
      errorMessage = 'Request was aborted due to timeout.';
    }
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      url: request.body ? JSON.parse(await request.text()).url : 'unknown'
    }, { status: 500 });
  }
}