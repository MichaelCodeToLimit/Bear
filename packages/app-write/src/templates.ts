export interface Template {
  id: string
  name: string
  description: string
  html: string
}

export const TEMPLATES: Template[] = [
  { id: 'blank', name: 'Blank document', description: 'Start from an empty page', html: '' },
  {
    id: 'letter',
    name: 'Letter',
    description: 'Formal letter with address block',
    html: `
<p>Your Name<br>Street Address<br>City, State ZIP<br>email@example.com</p>
<p>${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</p>
<p>Recipient Name<br>Title<br>Company<br>Street Address<br>City, State ZIP</p>
<p>Dear Recipient Name,</p>
<p>Use the first paragraph to say why you are writing. Keep it short and specific.</p>
<p>Use the middle paragraphs to give supporting detail, examples, or context.</p>
<p>Close by stating the next step you would like, and thank the reader for their time.</p>
<p>Sincerely,</p>
<p><br>Your Name</p>`
  },
  {
    id: 'resume',
    name: 'Resume',
    description: 'Clean one-page resume',
    html: `
<h1 style="text-align: center">Your Name</h1>
<p style="text-align: center">City, State · (555) 555-0100 · you@example.com · yoursite.example</p>
<hr>
<h2>Summary</h2>
<p>Two or three sentences about what you do best and what you are looking for.</p>
<h2>Experience</h2>
<h3>Job Title — Company</h3>
<p><em>Month Year – Present</em></p>
<ul><li><p>Achievement with a measurable result.</p></li><li><p>Another achievement, starting with a strong verb.</p></li></ul>
<h3>Job Title — Company</h3>
<p><em>Month Year – Month Year</em></p>
<ul><li><p>Achievement with a measurable result.</p></li></ul>
<h2>Education</h2>
<p><strong>Degree</strong>, School — Year</p>
<h2>Skills</h2>
<p>Skill one · Skill two · Skill three · Skill four</p>`
  },
  {
    id: 'report',
    name: 'Report',
    description: 'Title, summary, sections and a table',
    html: `
<h1>Report Title</h1>
<p><em>Prepared by Your Name · ${new Date().toLocaleDateString()}</em></p>
<h2>Executive summary</h2>
<p>Summarise the key findings and recommendations in one paragraph.</p>
<h2>Background</h2>
<p>Describe the context and the question this report answers.</p>
<h2>Findings</h2>
<table><tbody>
<tr><th><p>Area</p></th><th><p>Result</p></th><th><p>Notes</p></th></tr>
<tr><td><p>Area one</p></td><td><p>—</p></td><td><p></p></td></tr>
<tr><td><p>Area two</p></td><td><p>—</p></td><td><p></p></td></tr>
</tbody></table>
<h2>Recommendations</h2>
<ol><li><p>First recommendation.</p></li><li><p>Second recommendation.</p></li></ol>`
  }
]
