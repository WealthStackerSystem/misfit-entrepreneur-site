// netlify/functions/rss-proxy.js
// Fetches Libsyn RSS server-side — no CORS issues

const RSS_URL = 'https://rss.libsyn.com/shows/83038/destinations/390028.xml';

exports.handler = async function(event, context) {
  try {
    const response = await fetch(RSS_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MisfitEntrepreneur/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'RSS fetch failed: ' + response.status })
      };
    }

    const xml = await response.text();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600'  // Cache 1 hour
      },
      body: xml
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};
