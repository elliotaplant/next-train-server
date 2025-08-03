#!/usr/bin/env node

// Simple fetch script that mimics curl behavior
// Usage: node scripts/fetch.js [options] <url>

const args = process.argv.slice(2);
let url = '';
let options = {
  method: 'GET',
  headers: {}
};
let silent = false;
let includeHeaders = false;
let outputFile = null;
let dataOption = null;

// Parse arguments
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  
  if (arg === '-s' || arg === '--silent') {
    silent = true;
  } else if (arg === '-i' || arg === '--include') {
    includeHeaders = true;
  } else if (arg === '-o' || arg === '--output') {
    outputFile = args[++i];
  } else if (arg === '-H' || arg === '--header') {
    const header = args[++i];
    const [key, value] = header.split(':').map(s => s.trim());
    options.headers[key] = value;
  } else if (arg === '-X' || arg === '--request') {
    options.method = args[++i];
  } else if (arg === '-d' || arg === '--data') {
    dataOption = args[++i];
    options.method = 'POST';
    options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/x-www-form-urlencoded';
  } else if (arg === '--data-raw') {
    dataOption = args[++i];
    options.method = 'POST';
  } else if (arg === '-L' || arg === '--location') {
    // Follow redirects (fetch does this by default)
  } else if (!arg.startsWith('-')) {
    url = arg;
  }
}

if (!url) {
  console.error('Error: No URL provided');
  process.exit(1);
}

// Add body if data was provided
if (dataOption) {
  options.body = dataOption;
}

// Make the request
(async () => {
  try {
    const response = await fetch(url, options);
    
    if (includeHeaders) {
      console.log(`HTTP/${response.status} ${response.statusText}`);
      response.headers.forEach((value, key) => {
        console.log(`${key}: ${value}`);
      });
      console.log();
    }
    
    const text = await response.text();
    
    if (outputFile) {
      const fs = require('fs');
      fs.writeFileSync(outputFile, text);
      if (!silent) {
        console.error(`Downloaded to ${outputFile}`);
      }
    } else {
      console.log(text);
    }
    
    if (!response.ok && !silent) {
      process.exit(1);
    }
  } catch (error) {
    if (!silent) {
      console.error(`Error: ${error.message}`);
    }
    process.exit(1);
  }
})();