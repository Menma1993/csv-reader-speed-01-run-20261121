// Fast drop-in for csv-reader 1.0.0 (make.fun csv-reader-speed-01-run-20261121).
//
// Returns exactly what the reference returns for every input ({columns, rows,
// errors}), but reads the text with indexOf/slice jumps instead of one character
// at a time. No dependencies, no regex, pure: no clock, no randomness, nothing
// kept from one call to the next.
//
// How it stays identical:
//   - A record's errors all carry the line its record starts on and its index in
//     rows (null for the header), in the order met; short_row/long_row land when
//     the record ends, quote_junk when its field ends.
//   - A U+FEFF at the very start is dropped; a line left with no characters is
//     no record; a line holding only stray CRs is no record either (its stray_cr
//     errors stay).
//   - Outside quotes a CR not followed by LF is dropped (stray_cr); inside quotes
//     CRLF and a lone CR each read as one LF and count one line.
//   - A field that opens with a quote runs to the next quote that is not doubled;
//     what follows its closing quote, up to the next comma or line break, is
//     appended as it stands (quote_junk); a quote that never closes is a literal
//     character and the text after it is read again as unquoted
//     (unterminated_quote). A quote inside an unquoted field is literal.
//
// How it is fast:
//   - Most lines are clean (no quote, no CR): one slice + native split(',') each.
//   - Every other field is read by jumping to the next comma / line break with
//     indexOf and slicing the field out whole; a quoted field jumps quote to
//     quote the same way. Strings are never built a character at a time.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0;
  let line = 1;
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The last field's value, set by readUnquoted/readQuoted.
  let fval = '';
  // Characters kept by readUnquoted's last call (for quote_junk).
  let added = 0;

  // The record being read: the line it starts on and its index in rows (null: header).
  let recordLine = 1;
  let recordRow = null;

  // Reads unquoted characters onto `value` up to the next comma or line break.
  // Returns COMMA / LINE_BREAK / END, sets fval and added.
  function readUnquoted(value) {
    added = 0;
    let end;
    for (;;) {
      const c = text.indexOf(',', pos);
      const n = text.indexOf('\n', pos);
      let m;
      let kind;
      if (c === -1) { m = n; kind = LINE_BREAK; }
      else if (n === -1) { m = c; kind = COMMA; }
      else if (c < n) { m = c; kind = COMMA; }
      else { m = n; kind = LINE_BREAK; }
      if (m === -1) {
        // No comma or LF left: only a stray CR can still break the run.
        const r = text.slice(pos).indexOf('\r');
        if (r === -1) {
          if (pos < len) { value += text.slice(pos); added += len - pos; }
          pos = len;
          end = END;
          break;
        }
        if (r > 0) { value += text.slice(pos, pos + r); added += r; }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        pos += r + 1;
        continue;
      }
      // A CR inside [pos, m)? Only one that is not the CRLF before an LF matters.
      const r = text.slice(pos, m).indexOf('\r');
      if (r !== -1) {
        const p = pos + r;
        if (kind === LINE_BREAK && p === m - 1) {
          // CRLF: the field ends here.
          if (p > pos) { value += text.slice(pos, p); added += p - pos; }
          pos = m + 1;
          line += 1;
          end = LINE_BREAK;
          break;
        }
        if (r > 0) { value += text.slice(pos, p); added += r; }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        pos = p + 1;
        continue;
      }
      if (m > pos) { value += text.slice(pos, m); added += m - pos; }
      if (kind === COMMA) {
        pos = m + 1;
        end = COMMA;
      } else {
        pos = m + 1;
        line += 1;
        end = LINE_BREAK;
      }
      break;
    }
    fval = value;
    return end;
  }

  // Reads a quoted field whose opening quote is at pos.
  // Returns COMMA / LINE_BREAK / END, sets fval.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text after
        // it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        return readUnquoted('"');
      }
      if (q > pos) {
        const seg = text.slice(pos, q);
        if (seg.indexOf('\r') === -1 && seg.indexOf('\n') === -1) {
          value += seg;
        } else {
          // Fold the segment's line breaks: CRLF and a lone CR each read as
          // one LF and count one line. Split-based, so no scan ever runs past
          // the segment.
          const parts = seg.split('\n');
          line += parts.length - 1;
          let out = '';
          for (let i = 0; i < parts.length; i++) {
            let p = parts[i];
            if (p.indexOf('\r') !== -1) {
              // A trailing CR of a part followed by LF is the CRLF's CR: drop
              // it (the LF is already counted). Any other CR is a lone CR.
              if (i < parts.length - 1 && p.charCodeAt(p.length - 1) === 13) p = p.slice(0, -1);
              if (p.indexOf('\r') !== -1) {
                const sub = p.split('\r');
                line += sub.length - 1;
                p = sub.join('\n');
              }
            }
            out += p;
            if (i < parts.length - 1) out += '\n';
          }
          value += out;
        }
      }
      pos = q;
      if (text.charCodeAt(q + 1) === 34) {
        value += '"';
        pos = q + 2;
        continue;
      }
      pos = q + 1;
      break;
    }
    if (pos >= len) {
      fval = value;
      return END;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fval = value;
      return COMMA;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fval = value;
      return LINE_BREAK;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fval = value;
      return LINE_BREAK;
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break.
    const end = readUnquoted(value);
    if (added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return end;
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the rest of this line holds no quote and no CR (other than a
    // trailing CRLF), so the line is one whole record.
    const nl = text.indexOf('\n', pos);
    const segEnd = nl === -1 ? len : nl;
    let contentEnd = segEnd;
    if (nl !== -1 && segEnd > pos && text.charCodeAt(segEnd - 1) === 13) contentEnd = segEnd - 1;
    const seg = text.slice(pos, contentEnd);
    if (seg.indexOf('"') === -1 && seg.indexOf('\r') === -1) {
      const fields = seg.split(',');
      if (width < 0) width = fields.length;
      if (header && columns === null) {
        columns = fields;
      } else {
        if (fields.length < width) {
          errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
          while (fields.length < width) fields.push('');
        } else if (fields.length > width) {
          errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
        }
        rows.push(fields);
      }
      line += 1;
      pos = nl === -1 ? len : nl + 1;
      continue;
    }

    // Slow path: the record holds a quote or a CR; read it field by field.
    const fields = [];
    let quoted = false;
    let ended;
    do {
      if (text.charCodeAt(pos) === 34) {
        quoted = true;
        ended = readQuoted();
      } else {
        quoted = false;
        ended = readUnquoted('');
      }
      fields.push(fval);
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
