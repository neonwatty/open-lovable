import { describe, it, expect } from 'vitest';
import * as cheerio from 'cheerio';

// Since we need to test the functions from the route file, we'll need to extract them
// First, let's create a module with the testable functions

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

describe('scrape-url-enhanced unit tests', () => {
  describe('sanitizeQuotes', () => {
    it('should replace smart single quotes', () => {
      const input = '\u2018Hello\u2019 \u201aworld\u201b';
      const expected = "'Hello' 'world'";
      expect(sanitizeQuotes(input)).toBe(expected);
    });

    it('should replace smart double quotes', () => {
      const input = '\u201cHello world\u201d \u201etest\u201f';
      const expected = '"Hello world" "test"';
      expect(sanitizeQuotes(input)).toBe(expected);
    });

    it('should replace guillemets', () => {
      const input = '\u00abHello\u00bb \u2039world\u203a';
      const expected = '"Hello" \'world\'';
      expect(sanitizeQuotes(input)).toBe(expected);
    });

    it('should replace dashes and ellipsis', () => {
      const input = 'Hello\u2013world\u2014test\u2026';
      const expected = 'Hello-world-test...';
      expect(sanitizeQuotes(input)).toBe(expected);
    });

    it('should replace non-breaking spaces', () => {
      const input = 'Hello\u00a0world';
      const expected = 'Hello world';
      expect(sanitizeQuotes(input)).toBe(expected);
    });

    it('should handle empty string', () => {
      expect(sanitizeQuotes('')).toBe('');
    });

    it('should handle string with no special characters', () => {
      const input = 'Regular text with normal quotes "and apostrophes\'';
      expect(sanitizeQuotes(input)).toBe(input);
    });
  });

  describe('htmlToMarkdown', () => {
    it('should convert headings to markdown', () => {
      const html = '<h1>Title</h1><h2>Subtitle</h2><h3>Section</h3>';
      const $ = cheerio.load(html);
      const result = htmlToMarkdown($);
      
      expect(result).toContain('# Title');
      expect(result).toContain('## Subtitle');
      expect(result).toContain('### Section');
    });

    it('should convert paragraphs', () => {
      const html = '<p>First paragraph</p><p>Second paragraph</p>';
      const $ = cheerio.load(html);
      const result = htmlToMarkdown($);
      
      expect(result).toContain('First paragraph');
      expect(result).toContain('Second paragraph');
    });

    it('should convert links', () => {
      const html = '<a href="https://example.com">Example Link</a>';
      const $ = cheerio.load(html);
      const result = htmlToMarkdown($);
      
      expect(result).toContain('[Example Link](https://example.com)');
    });

    it('should convert unordered lists', () => {
      const html = '<ul><li>Item 1</li><li>Item 2</li><li>Item 3</li></ul>';
      const $ = cheerio.load(html);
      const result = htmlToMarkdown($);
      
      expect(result).toContain('- Item 1');
      expect(result).toContain('- Item 2');
      expect(result).toContain('- Item 3');
    });

    it('should convert ordered lists', () => {
      const html = '<ol><li>First</li><li>Second</li><li>Third</li></ol>';
      const $ = cheerio.load(html);
      const result = htmlToMarkdown($);
      
      expect(result).toContain('1. First');
      expect(result).toContain('2. Second');
      expect(result).toContain('3. Third');
    });

    it('should remove script and style tags', () => {
      const html = '<p>Content</p><script>alert("bad");</script><style>body {color: red;}</style><p>More content</p>';
      const $ = cheerio.load(html);
      const result = htmlToMarkdown($);
      
      expect(result).toContain('Content');
      expect(result).toContain('More content');
      expect(result).not.toContain('alert');
      expect(result).not.toContain('color: red');
    });

    it('should handle empty content', () => {
      const html = '<div></div>';
      const $ = cheerio.load(html);
      const result = htmlToMarkdown($);
      
      expect(result).toBe('');
    });

    it('should clean up excessive line breaks', () => {
      const html = '<p>Paragraph 1</p><br><br><br><p>Paragraph 2</p>';
      const $ = cheerio.load(html);
      const result = htmlToMarkdown($);
      
      // Should not have more than 2 consecutive newlines
      expect(result).not.toMatch(/\n\n\n/);
    });
  });

  describe('extractMetadata', () => {
    it('should extract title from title tag', () => {
      const html = '<title>Page Title</title>';
      const $ = cheerio.load(html);
      const metadata = extractMetadata($, 'https://example.com');
      
      expect(metadata.title).toBe('Page Title');
      expect(metadata.url).toBe('https://example.com');
    });

    it('should extract title from Open Graph meta tag when no title tag', () => {
      const html = '<meta property="og:title" content="OG Title">';
      const $ = cheerio.load(html);
      const metadata = extractMetadata($, 'https://example.com');
      
      expect(metadata.title).toBe('OG Title');
    });

    it('should extract title from Twitter meta tag when no title or og:title', () => {
      const html = '<meta name="twitter:title" content="Twitter Title">';
      const $ = cheerio.load(html);
      const metadata = extractMetadata($, 'https://example.com');
      
      expect(metadata.title).toBe('Twitter Title');
    });

    it('should extract title from h1 tag as fallback', () => {
      const html = '<h1>H1 Title</h1>';
      const $ = cheerio.load(html);
      const metadata = extractMetadata($, 'https://example.com');
      
      expect(metadata.title).toBe('H1 Title');
    });

    it('should extract description from meta description', () => {
      const html = '<meta name="description" content="Page description">';
      const $ = cheerio.load(html);
      const metadata = extractMetadata($, 'https://example.com');
      
      expect(metadata.description).toBe('Page description');
    });

    it('should extract description from Open Graph', () => {
      const html = '<meta property="og:description" content="OG description">';
      const $ = cheerio.load(html);
      const metadata = extractMetadata($, 'https://example.com');
      
      expect(metadata.description).toBe('OG description');
    });

    it('should extract keywords', () => {
      const html = '<meta name="keywords" content="web, scraping, test">';
      const $ = cheerio.load(html);
      const metadata = extractMetadata($, 'https://example.com');
      
      expect(metadata.keywords).toBe('web, scraping, test');
    });

    it('should extract author', () => {
      const html = '<meta name="author" content="John Doe">';
      const $ = cheerio.load(html);
      const metadata = extractMetadata($, 'https://example.com');
      
      expect(metadata.author).toBe('John Doe');
    });

    it('should extract published time', () => {
      const html = '<meta property="article:published_time" content="2023-01-01T00:00:00Z">';
      const $ = cheerio.load(html);
      const metadata = extractMetadata($, 'https://example.com');
      
      expect(metadata.publishedTime).toBe('2023-01-01T00:00:00Z');
    });

    it('should extract image from Open Graph', () => {
      const html = '<meta property="og:image" content="https://example.com/image.jpg">';
      const $ = cheerio.load(html);
      const metadata = extractMetadata($, 'https://example.com');
      
      expect(metadata.image).toBe('https://example.com/image.jpg');
    });

    it('should handle complex HTML with multiple meta tags', () => {
      const html = `
        <title>Complex Page</title>
        <meta name="description" content="A complex page description">
        <meta name="keywords" content="complex, page, test">
        <meta name="author" content="Test Author">
        <meta property="og:title" content="OG Complex Page">
        <meta property="og:description" content="OG description">
        <meta property="og:image" content="https://example.com/og-image.jpg">
        <meta name="twitter:title" content="Twitter Complex Page">
        <meta property="article:published_time" content="2023-06-15T10:30:00Z">
      `;
      const $ = cheerio.load(html);
      const metadata = extractMetadata($, 'https://example.com');
      
      // Should prefer title tag over OG/Twitter
      expect(metadata.title).toBe('Complex Page');
      expect(metadata.description).toBe('A complex page description');
      expect(metadata.keywords).toBe('complex, page, test');
      expect(metadata.author).toBe('Test Author');
      expect(metadata.publishedTime).toBe('2023-06-15T10:30:00Z');
      expect(metadata.image).toBe('https://example.com/og-image.jpg');
    });

    it('should handle missing metadata gracefully', () => {
      const html = '<div>Some content</div>';
      const $ = cheerio.load(html);
      const metadata = extractMetadata($, 'https://example.com');
      
      expect(metadata.title).toBe('');
      expect(metadata.description).toBe('');
      expect(metadata.keywords).toBe('');
      expect(metadata.author).toBe('');
      expect(metadata.publishedTime).toBe('');
      expect(metadata.image).toBe('');
      expect(metadata.url).toBe('https://example.com');
    });
  });
});