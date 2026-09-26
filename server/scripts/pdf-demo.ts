// Full paid report for any site, without payment: for demos, portfolio and checking the PDF with PAC.
// Usage: npm run pdf:demo -- www.exemple.be
import { mkdir, writeFile } from 'node:fs/promises';
import { analyserSite } from '../src/crawl.js';
import { renderPdf } from '../src/pdf.js';
import { closeBrowser } from '../src/scan.js';
import { buildSiteReport } from '../src/site-report.js';
import { assertPublicHost, parsePublicUrl } from '../src/ssrf.js';

const url = parsePublicUrl(process.argv[2] ?? '');
await assertPublicHost(url.hostname);
try {
  const pages = await analyserSite(url, { onProgress: (fait, total) => console.log(`Pages analysées : ${fait}/${total}`) });
  const rapport = buildSiteReport(pages);
  const pdf = await renderPdf(rapport, `${process.env.PUBLIC_URL ?? 'http://localhost:4200'}/faire-corriger`);
  await mkdir('data', { recursive: true });
  const fichier = `data/demo-${rapport.site}.pdf`;
  await writeFile(fichier, pdf);
  console.log(`${fichier} (${Math.round(pdf.length / 1024)} Ko, score ${rapport.score}/100, ${rapport.problemes.length} problèmes)`);
} finally {
  await closeBrowser();
}
