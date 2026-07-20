/**
 * Persona File Parser
 * Extracts plain text from a student-uploaded priming document (.txt/.pdf/.docx)
 * entirely client-side. Only the extracted text is kept — the original file
 * is never uploaded or stored.
 */

import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import mammoth from 'mammoth';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const extractFromPdf = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageTexts = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    pageTexts.push(content.items.map((item) => item.str).join(' '));
  }
  return pageTexts.join('\n\n');
};

const extractFromDocx = async (file) => {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
};

const extractFromText = async (file) => file.text();

/**
 * @param {File} file
 * @returns {Promise<string>} extracted plain text
 * @throws {Error} if the file type is unsupported or parsing fails
 */
export const extractTextFromFile = async (file) => {
  const name = file.name.toLowerCase();

  let text;
  if (name.endsWith('.pdf')) {
    text = await extractFromPdf(file);
  } else if (name.endsWith('.docx')) {
    text = await extractFromDocx(file);
  } else if (name.endsWith('.txt')) {
    text = await extractFromText(file);
  } else {
    throw new Error('Unsupported file type. Please upload a .txt, .pdf, or .docx file.');
  }

  const trimmed = (text || '').trim();
  if (!trimmed) {
    throw new Error('Could not find any text in that file. Please check the file and try again.');
  }
  return trimmed;
};
