require('dotenv').config();
const axios = require('axios');

// ---------------------------------------------------------
// 1. Keyword Dictionary & Category Rules
// ---------------------------------------------------------
const CATEGORY_RULES = [
  {
    category: 'Network / Wi-Fi',
    assignmentGroup: 'Network Support',
    keywords: ['wifi', 'wi-fi', 'internet', 'connection', 'network', 'offline', 'dns', 'ip address']
  },
  {
    category: 'Hardware / Projector',
    assignmentGroup: 'AV & Classroom Support',
    keywords: ['projector', 'hdmi', 'display', 'screen', 'smartboard', 'monitor', 'tv']
  },
  {
    category: 'Account / Password',
    assignmentGroup: 'User Access Support',
    keywords: ['password', 'login', 'locked', 'account', 'reset', 'sso', 'credentials', 'mfa', '2fa']
  },
  {
    category: 'Hardware / Computer Performance',
    assignmentGroup: 'Desktop Support',
    keywords: ['slow', 'lag', 'freezing', 'blue screen', 'bsod', 'crash', 'reboot', 'laptop', 'desktop', 'ram']
  },
  {
    category: 'Software / Applications',
    assignmentGroup: 'Software Support',
    keywords: ['software', 'app', 'install', 'microsoft teams', 'zoom', 'canvas', 'portal', 'excel', 'word']
  }
];

// ---------------------------------------------------------
// 2. Classification Function
// ---------------------------------------------------------
/**
 * Analyzes short description and description to determine category and group.
 * @param {string} shortDesc 
 * @param {string} desc 
 * @returns {Object} Categorization result
 */
function classifyTicket(shortDesc = '', desc = '') {
  const combinedText = `${shortDesc} ${desc}`.toLowerCase();

  for (const rule of CATEGORY_RULES) {
    const matchedKeyword = rule.keywords.find(keyword => combinedText.includes(keyword));
    if (matchedKeyword) {
      return {
        category: rule.category,
        assignmentGroup: rule.assignmentGroup,
        confidence: 'HIGH',
        matchedKeyword
      };
    }
  }

  return {
    category: 'Inquiry / Help Desk',
    assignmentGroup: 'Tier 1 Helpdesk',
    confidence: 'LOW',
    matchedKeyword: null
  };
}

// ---------------------------------------------------------
// 3. ServiceNow API REST Client
// ---------------------------------------------------------
const instanceUrl = process.env.NOW_INSTANCE;
const authHeader = Buffer.from(
  `${process.env.NOW_USERNAME}:${process.env.NOW_PASSWORD}`
).toString('base64');

const api = axios.create({
  baseURL: `${instanceUrl}/api/now/table`,
  headers: {
    'Authorization': `Basic ${authHeader}`,
    'Accept': 'application/json',
    'Content-Type': 'application/json'
  }
});

// ---------------------------------------------------------
// 4. Batch Processing Function
// ---------------------------------------------------------
async function processUncategorizedIncidents() {
  try {
    console.log('Fetching unassigned / new incidents from ServiceNow...');
    
    // Query incidents that are open (state = 1) or uncategorized
    const response = await api.get('/incident?sysparm_query=state=1^categoryIsEmpty&sysparm_limit=10');
    const incidents = response.data.result;

    if (!incidents || incidents.length === 0) {
      console.log('No unclassified incidents found.');
      return;
    }

    console.log(`Found ${incidents.length} incidents to process.`);

    for (const incident of incidents) {
      const result = classifyTicket(incident.short_description, incident.description);

      console.log(`\nIncident Number: ${incident.number}`);
      console.log(`Short Description: "${incident.short_description}"`);
      console.log(`Classified As: [${result.category}] via matched keyword "${result.matchedKeyword}"`);

      // Update ServiceNow Record
      await api.patch(`/incident/${incident.sys_id}`, {
        category: result.category,
        work_notes: `Automated Classification Engine assigned category '${result.category}' based on key term: '${result.matchedKeyword}'.`
      });

      console.log(`Successfully updated ${incident.number} in ServiceNow.`);
    }
  } catch (error) {
    if (error.response) {
      console.error(`ServiceNow API Error (${error.response.status}):`, error.response.data);
    } else {
      console.error('Execution Error:', error.message);
    }
  }
}

// ---------------------------------------------------------
// 5. Test Mode / Execution
// ---------------------------------------------------------
function runLocalTests() {
  console.log('--- Running Local Classifier Tests ---');
  
  const testCases = [
    { short_description: 'Wi-Fi keeps dropping in Room 3B', description: 'Students cannot connect to school internet.' },
    { short_description: 'Projector in lab is flickering', description: 'Connected via HDMI but no display.' },
    { short_description: 'Teacher locked out of portal', description: 'Need password reset immediately.' },
    { short_description: 'Laptop is super slow today', description: 'Freezing whenever I open Excel.' }
  ];

  testCases.forEach((test, index) => {
    const classification = classifyTicket(test.short_description, test.description);
    console.log(`Test #${index + 1}: "${test.short_description}"`);
    console.log(`  -> Category: ${classification.category}`);
    console.log(`  -> Group:    ${classification.assignmentGroup}`);
    console.log(`  -> Keyword:  ${classification.matchedKeyword}\n`);
  });
}

// If environment credentials are placeholder, run local test mode.
if (!process.env.NOW_INSTANCE || process.env.NOW_INSTANCE.includes('devXXXXX')) {
  console.log('ServiceNow URL not configured in .env file. Running local test mode:\n');
  runLocalTests();
} else {
  processUncategorizedIncidents();
}