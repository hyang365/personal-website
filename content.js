// Edit the archive here. Use \n\n to separate paragraphs in body.
// Add links as { label: "Link text", url: "https://example.com" }.
export const entries = {
  academics: { title: "Academics", kind: "Folder", body: "Academic notes, coursework, and projects will go here.", links: [] },
  internships: { title: "Internships", kind: "Folder", body: "Internship experiences and work samples will go here.", links: [] },
  hobbies: { title: "Hobbies", kind: "Folder", body: "Interests and side projects will go here.", links: [] },
  swimming: { title: "Swimming", kind: "Trophy", body: "Swimming stories and milestones will go here.", links: [] },
  globe: { title: "Globe", kind: "Globe", body: "Places, memories, and travel notes will go here.", links: [] },
  book: { title: "Reading", kind: "Book", body: "Favorite books and reading notes will go here.", links: [] }
};

// Optional multi-page folder format (each page has title and body).
// Example: entries.academics.pages = [{ title: 'Education', body: 'Your text' },
//   { title: 'Projects', body: 'Your next page' }];
for (const key of ['academics', 'internships', 'hobbies']) {
  entries[key].pages = [
    { title: entries[key].title, body: entries[key].body },
    { title: 'Notes', body: 'Add your notes, projects, or stories here.' }
  ];
}

entries.book.pages = [
  { title: 'Reading journal', body: entries.book.body },
  { title: 'Bookshelf', body: 'Keep a list of books you have read or want to read.' },
  { title: 'Reading notes', body: 'Write down the ideas you want to come back to.' },
  { title: 'Favorite passages', body: 'Save a passage and a note about why it stood out.' }
];
