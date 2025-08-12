import { NextRequest, NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

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

// Function to convert HTML to markdown-like text
function htmlToMarkdown($: cheerio.CheerioAPI): string {
  // Remove script and style elements
  $('script, style, noscript').remove();
  
  // Convert common elements to markdown-like format
  $('h1').each((_, el) => {
    const text = $(el).text().trim();
    $(el).replaceWith(`# ${text}\n\n`);
  });
  
  $('h2').each((_, el) => {
    const text = $(el).text().trim();
    $(el).replaceWith(`## ${text}\n\n`);
  });
  
  $('h3').each((_, el) => {
    const text = $(el).text().trim();
    $(el).replaceWith(`### ${text}\n\n`);
  });
  
  $('h4').each((_, el) => {
    const text = $(el).text().trim();
    $(el).replaceWith(`#### ${text}\n\n`);
  });
  
  $('h5').each((_, el) => {
    const text = $(el).text().trim();
    $(el).replaceWith(`##### ${text}\n\n`);
  });
  
  $('h6').each((_, el) => {
    const text = $(el).text().trim();
    $(el).replaceWith(`###### ${text}\n\n`);
  });
  
  // Convert paragraphs
  $('p').each((_, el) => {
    const text = $(el).text().trim();
    if (text) {
      $(el).replaceWith(`${text}\n\n`);
    }
  });
  
  // Convert links
  $('a').each((_, el) => {
    const text = $(el).text().trim();
    const href = $(el).attr('href');
    if (text && href) {
      $(el).replaceWith(`[${text}](${href})`);
    }
  });
  
  // Convert lists
  $('ul').each((_, el) => {
    let listText = '';
    $(el).find('li').each((_, li) => {
      const text = $(li).text().trim();
      if (text) {
        listText += `- ${text}\n`;
      }
    });
    $(el).replaceWith(`${listText}\n`);
  });
  
  $('ol').each((_, el) => {
    let listText = '';
    $(el).find('li').each((index, li) => {
      const text = $(li).text().trim();
      if (text) {
        listText += `${index + 1}. ${text}\n`;
      }
    });
    $(el).replaceWith(`${listText}\n`);
  });
  
  // Get the text content and clean it up
  const text = $.text()
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Remove excessive line breaks
    .replace(/^\s+|\s+$/g, '') // Trim whitespace
    .replace(/\n\s+/g, '\n'); // Remove leading spaces on lines
  
  return text;
}

// Function to extract metadata from HTML
function extractMetadata($: cheerio.CheerioAPI, url: string) {
  const title = $('title').text() || 
                $('meta[property="og:title"]').attr('content') || 
                $('meta[name="twitter:title"]').attr('content') || 
                $('h1').first().text() || '';
  
  const description = $('meta[name="description"]').attr('content') || 
                     $('meta[property="og:description"]').attr('content') || 
                     $('meta[name="twitter:description"]').attr('content') || '';
  
  const keywords = $('meta[name="keywords"]').attr('content') || '';
  
  const author = $('meta[name="author"]').attr('content') || 
                $('meta[property="article:author"]').attr('content') || '';
  
  const publishedTime = $('meta[property="article:published_time"]').attr('content') || 
                       $('meta[name="date"]').attr('content') || '';
  
  const image = $('meta[property="og:image"]').attr('content') || 
               $('meta[name="twitter:image"]').attr('content') || '';
  
  return {
    title: title.trim(),
    description: description.trim(),
    keywords: keywords.trim(),
    author: author.trim(),
    publishedTime: publishedTime.trim(),
    image: image.trim(),
    url
  };
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    
    if (!url) {
      return NextResponse.json({
        success: false,
        error: 'URL is required'
      }, { status: 400 });
    }
    
    console.log('[scrape-url-enhanced] Scraping with local fetch:', url);
    
    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch (error) {
      throw new Error('Invalid URL format');
    }
    
    // Only allow HTTP and HTTPS protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      throw new Error('Only HTTP and HTTPS URLs are allowed');
    }
    
    // Fetch HTML content with proper headers and timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
    
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Open-Lovable-Bot/1.0)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        signal: controller.signal,
        redirect: 'follow',
      });
    } finally {
      clearTimeout(timeoutId);
    }
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
    }
    
    // Check content type
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      throw new Error('URL does not return HTML content');
    }
    
    // Get HTML content
    const html = await response.text();
    
    if (!html || html.trim().length === 0) {
      throw new Error('No content found at URL');
    }
    
    // Parse HTML with cheerio
    const $ = cheerio.load(html);
    
    // Extract metadata
    const metadata = extractMetadata($, url);
    
    // Convert HTML to markdown-like text
    const markdownContent = htmlToMarkdown($);
    
    // Sanitize the content
    const sanitizedMarkdown = sanitizeQuotes(markdownContent);
    
    // Format content for AI
    const formattedContent = `
Title: ${sanitizeQuotes(metadata.title)}
Description: ${sanitizeQuotes(metadata.description)}
URL: ${url}

Main Content:
${sanitizedMarkdown}
    `.trim();
    
    return NextResponse.json({
      success: true,
      url,
      content: formattedContent,
      structured: {
        title: sanitizeQuotes(metadata.title),
        description: sanitizeQuotes(metadata.description),
        content: sanitizedMarkdown,
        url
      },
      metadata: {
        scraper: 'local-fetch',
        timestamp: new Date().toISOString(),
        contentLength: formattedContent.length,
        cached: false,
        ...metadata
      },
      message: 'URL scraped successfully with local fetch'
    });
    
  } catch (error) {
    console.error('[scrape-url-enhanced] Error:', error);
    
    // Handle AbortError specifically
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({
        success: false,
        error: 'Request timeout - URL took too long to respond'
      }, { status: 408 });
    }
    
    return NextResponse.json({
      success: false,
      error: (error as Error).message
    }, { status: 500 });
  }
}