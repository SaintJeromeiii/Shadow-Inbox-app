const fs = require('fs');
const path = require('path');
const { faker } = require('@faker-js/faker');

// Configuration: How many mock items do you want?
const NUMBER_OF_EMAILS = 50; 

function generateMockEmails(count) {
  const emails = [];

  for (let i = 0; i < count; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    
    emails.push({
      id: faker.string.uuid(),
      fromName: `${firstName} ${lastName}`,
      fromEmail: faker.internet.email({ firstName, lastName }),
      subject: faker.company.catchPhrase(),
      body: `${faker.lorem.paragraph()}\n\nBest regards,\n${firstName}`,
      receivedAt: faker.date.recent({ days: 2 }).toISOString(),
      status: 'pending', // matching your app triage filters
      aiSummary: faker.gptMode ? "" : faker.company.buzzPhrase() 
    });
  }

  return { emails };
}

// Generate data and save it straight to your app's local data target
const mockData = generateMockEmails(NUMBER_OF_EMAILS);
const outputPath = path.join(__dirname, 'mockEmails.json');

fs.writeFileSync(outputPath, JSON.stringify(mockData, null, 2));
console.log(`\n✔ Successfully generated ${NUMBER_OF_EMAILS} new mock emails at: ${outputPath}\n`);