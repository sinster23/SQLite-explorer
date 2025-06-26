import { open } from "fs/promises";

const databaseFilePath = process.argv[2];
const command = process.argv[3];

function readVarint(buffer, offset) {
  let value = 0n;
  let bytesRead = 0;

  for (let i = 0; i < 9; i++) {
    const byte = buffer[offset + i];
    bytesRead++;

    if (i === 8) {
      value = (value << 8n) + BigInt(byte);
      break;
    }

    value = (value << 7n) + BigInt(byte & 0x7f);
    if ((byte & 0x80) === 0) break;
  }

  return { value, length: bytesRead };
}

if (command === ".dbinfo") {
  const databaseFileHandler = await open(databaseFilePath, "r");
  const { buffer: headerBuffer } = await databaseFileHandler.read({
    length: 100,
    position: 0,
    buffer: Buffer.alloc(100),
  });
  const pageSize = headerBuffer.readUInt16BE(16);

  const { buffer: pageBuffer } = await databaseFileHandler.read({
    length: pageSize,
    position: 0,
    buffer: Buffer.alloc(pageSize),
  });

  // The number of cells is stored at offset 100 + 3 = 103
  const numberOfCells = pageBuffer.readUInt16BE(100 + 3);

  console.log(`page size: ${pageSize}`);
  console.log(`number of tables: ${numberOfCells}`);
} else if (command === ".tables") {
  const databaseFileHandler = await open(databaseFilePath, "r");

  const header = Buffer.alloc(100);
  await databaseFileHandler.read({ position: 0, buffer: header, length: 100 });
  const pageSize = header.readUInt16BE(16);

  const page = Buffer.alloc(pageSize);
  await databaseFileHandler.read({
    position: 0,
    buffer: page,
    length: pageSize,
  });

  const numberOfCells = page.readUInt16BE(100 + 3); // offset 103
  let nooftables = [];

  for (let i = 0; i < numberOfCells; i++) {
    const cellOffset = page.readUInt16BE(100 + 8 + i * 2);
    let offset = cellOffset;

    // 1. Skip record size varint
    let { length: len1 } = readVarint(page, offset);
    offset += len1;

    // 2. Skip rowid varint
    let { length: len2 } = readVarint(page, offset);
    offset += len2;

    // 3. Read header size varint
    const { value: headerSize, length: len3 } = readVarint(page, offset);
    offset += len3;

    const serialTypes = [];
    let serialOffset = offset;

    // 4. Read serial types for 5 columns
    for (let j = 0; j < 5; j++) {
      const { value: serialType, length } = readVarint(page, serialOffset);
      serialTypes.push(Number(serialType));
      serialOffset += length;
    }
    let contentOffset = serialOffset;
    let tblName = null;

    for (let j = 0; j < 5; j++) {
      const serialType = serialTypes[j];

      if (serialType >= 13 && serialType % 2 === 1) {
        const textLength = (serialType - 13) / 2;
        const text = page.toString(
          "utf8",
          contentOffset,
          contentOffset + textLength
        );

        if (j === 2) {
          tblName = text;
        }

        contentOffset += textLength;
      } else if (serialType === 1) {
        if (j === 2) tblName = page.readInt8(contentOffset);
        contentOffset += 1;
      } else if (serialType === 2) {
        if (j === 2) tblName = page.readInt16BE(contentOffset);
        contentOffset += 2;
      } else if (serialType === 3) {
        contentOffset += 3;
      } else if (serialType === 4) {
        contentOffset += 4;
      } else if (serialType === 5) {
        contentOffset += 6;
      } else if (serialType === 6 || serialType === 7) {
        contentOffset += 8;
      } else {
        // null or unknown
      }
    }

    if (tblName && tblName !== "sqlite_sequence") {
      nooftables.push(tblName);
    }
  }
  console.log(nooftables.join(" "));
} else if (command.startsWith("SELECT COUNT(*) FROM")) {
  const tableToCount = command.split(" ").at(-1);
  const databaseFileHandler = await open(databaseFilePath, "r");

  const header = Buffer.alloc(100);
  await databaseFileHandler.read({ position: 0, buffer: header, length: 100 });
  const pageSize = header.readUInt16BE(16);

  const page = Buffer.alloc(pageSize);
  await databaseFileHandler.read({
    position: 0,
    buffer: page,
    length: pageSize,
  });

  const numberOfCells = page.readUInt16BE(100 + 3);
  let rootPageNumber = null;

  for (let i = 0; i < numberOfCells; i++) {
    const cellOffset = page.readUInt16BE(100 + 8 + i * 2);
    let offset = cellOffset;

    // Skip record size and rowid
    offset += readVarint(page, offset).length;
    offset += readVarint(page, offset).length;

    // Read header size
    const { value: headerSize, length: headerLen } = readVarint(page, offset);
    offset += headerLen;

    // Read serial types
    const serialTypes = [];
    let serialOffset = offset;

    for (let j = 0; j < 5; j++) {
      const { value: serialType, length } = readVarint(page, serialOffset);
      serialTypes.push(Number(serialType));
      serialOffset += length;
    }

    let contentOffset = serialOffset;
    let tblName = null;
    let rootPage = null;
    let type = null;

    for (let j = 0; j < 5; j++) {
      const serialType = serialTypes[j];

      if (serialType >= 13 && serialType % 2 === 1) {
        const textLength = (serialType - 13) / 2;
        const text = page.toString(
          "utf8",
          contentOffset,
          contentOffset + textLength
        );
        if (j === 0) type = text;
        if (j === 2) tblName = text;
        contentOffset += textLength;
      } else if (serialType === 1) {
        if (j === 3) rootPage = page.readUInt8(contentOffset);
        contentOffset += 1;
      } else if (serialType === 2) {
        if (j === 3) rootPage = page.readUInt16BE(contentOffset);
        contentOffset += 2;
      } else if (serialType === 3) {
        if (j === 3)
          rootPage =
            (page[contentOffset] << 16) |
            (page[contentOffset + 1] << 8) |
            page[contentOffset + 2];
        contentOffset += 3;
      } else if (serialType === 4) {
        if (j === 3) rootPage = page.readUInt32BE(contentOffset);
        contentOffset += 4;
      } else {
        contentOffset += [0, 1, 2, 3, 4, 6, 8][serialType] || 0;
      }
    }

    if (tblName === tableToCount && type === "table") {
      rootPageNumber = rootPage;
      break;
    }
  }

  if (!rootPageNumber) {
    console.log(`0`);
    process.exit(0);
  }

  const tablePage = Buffer.alloc(pageSize);
  await databaseFileHandler.read({
    position: (rootPageNumber - 1) * pageSize,
    buffer: tablePage,
    length: pageSize,
  });

  const rowCount = tablePage.readUInt16BE(3);
  console.log(rowCount);
} else if (command.startsWith("SELECT")) {
  const parts = command.split(" ");
  const fromIndex = parts.findIndex(part => part.toUpperCase() === "FROM");
  const columnPart = parts.slice(1, fromIndex).join(" "); 
  const columnNames = columnPart.split(",").map((col) => col.trim());
  const tableName = parts[fromIndex + 1];


  let filterColumn = null;
  let filterValue = null;

  if (parts.includes("WHERE")) {
    const whereIndex = parts.indexOf("WHERE");
    filterColumn = parts[whereIndex + 1];
    filterValue = parts[whereIndex + 3].replace(/^'|'$/g, ""); // remove quotes
  }

  const databaseFileHandler = await open(databaseFilePath, "r");
  const header = Buffer.alloc(100);
  await databaseFileHandler.read({ position: 0, buffer: header, length: 100 });
  const pageSize = header.readUInt16BE(16);

  const page = Buffer.alloc(pageSize);
  await databaseFileHandler.read({
    position: 0,
    buffer: page,
    length: pageSize,
  });

  const numberOfCells = page.readUInt16BE(100 + 3);

  let rootPageNumber = null;
  let createTableSQL = null;

  for (let i = 0; i < numberOfCells; i++) {
    const cellOffset = page.readUInt16BE(100 + 8 + i * 2);
    let offset = cellOffset;

    offset += readVarint(page, offset).length; // skip record size
    offset += readVarint(page, offset).length; // skip rowid

    const { value: headerSize, length: len3 } = readVarint(page, offset);
    offset += len3;

    const serialTypes = [];
    let serialOffset = offset;

    for (let j = 0; j < 5; j++) {
      const { value: serialType, length } = readVarint(page, serialOffset);
      serialTypes.push(Number(serialType));
      serialOffset += length;
    }

    let contentOffset = serialOffset;
    let tblName = null;
    let rootPage = null;
    let sql = null;
    let type = null;

    for (let j = 0; j < 5; j++) {
      const serialType = serialTypes[j];

      if (j === 3) {
        if (serialType === 1) {
          rootPage = page.readUInt8(contentOffset);
          contentOffset += 1;
        } else if (serialType === 2) {
          rootPage = page.readUInt16BE(contentOffset);
          contentOffset += 2;
        } else if (serialType === 4) {
          rootPage = page.readUInt32BE(contentOffset);
          contentOffset += 4;
        } else {
          const sizes = [0, 1, 2, 3, 4, 6, 8];
          contentOffset += sizes[serialType] || 0;
        }
      } else if (serialType >= 13 && serialType % 2 === 1) {
        const textLength = (serialType - 13) / 2;
        const text = page.toString(
          "utf8",
          contentOffset,
          contentOffset + textLength
        );
        if (j === 0) type = text;
        if (j === 2) tblName = text;
        if (j === 4) sql = text;
        contentOffset += textLength;
      } else {
        contentOffset += 1;
      }
    }

    if (tblName === tableName && type === "table") {
      rootPageNumber = rootPage;
      createTableSQL = sql;
      break;
    }
  }

  if (!rootPageNumber || !createTableSQL) {
    process.exit(0);
  }

  const columns = createTableSQL
    .slice(createTableSQL.indexOf("(") + 1, createTableSQL.lastIndexOf(")"))
    .split(",")
    .map((col) => col.trim().split(" ")[0]);

  const targetIndices = columnNames.map(name => columns.indexOf(name.trim()));
  const filterIndex = filterColumn ? columns.indexOf(filterColumn) : -1;

  const tablePage = Buffer.alloc(pageSize);
  const pagePosition = (rootPageNumber - 1) * pageSize;
  await databaseFileHandler.read({
    position: pagePosition,
    buffer: tablePage,
    length: pageSize,
  });

  const rowCount = tablePage.readUInt16BE(3);

  for (let i = 0; i < rowCount; i++) {
    const cellOffset = tablePage.readUInt16BE(8 + i * 2);
    let offset = cellOffset;

    // Skip payload size and rowid

    // Skip payload size
    const { length: payloadLen } = readVarint(tablePage, offset);
    offset += payloadLen;

    // Skip rowid
    const { length: rowidLen } = readVarint(tablePage, offset);
    offset += rowidLen;

    const headerStart = offset;
    const { value: headerSize, length: headerSizeLen } = readVarint(
      tablePage,
      offset
    );
    offset += headerSizeLen;

    // headerEnd is relative to headerStart
    const headerEnd = headerStart + Number(headerSize);

    let serialOffset = offset;
    const serialTypes = [];

    while (serialOffset < headerEnd) {
      const { value: serialType, length } = readVarint(tablePage, serialOffset);
      serialTypes.push(Number(serialType));
      serialOffset += length;
    }

    // Content starts right after header
    let contentOffset = headerEnd;
    const selectedValues = [];
    let match= true;

    for (let j = 0; j < serialTypes.length; j++) {
      const serialType = serialTypes[j];
      const isTarget= targetIndices.includes(j);

      let value = null;

        if (serialType >= 13 && serialType % 2 === 1) {
          const textLength = (serialType - 13) / 2;
          const text = tablePage.toString(
            "utf8",
            contentOffset,
            contentOffset + textLength
          );
          if(isTarget) value = text;
          contentOffset+= textLength
        }
        else{
          // Skip over this column's content
          if (serialType >= 13 && serialType % 2 === 1)
            contentOffset += (serialType - 13) / 2;
          else if (serialType === 1) contentOffset += 1;
          else if (serialType === 2) contentOffset += 2;
          else if (serialType === 3) contentOffset += 3;
          else if (serialType === 4) contentOffset += 4;
          else if (serialType === 5) contentOffset += 6;
          else if (serialType === 6 || serialType === 7) contentOffset += 8;
          else if (serialType === 8 || serialType === 9) contentOffset += 0; // null
        }

        if(j === filterIndex && value !== filterValue)
          match = false;

        if(isTarget) {
          selectedValues.push(value);
        }
    }
    if(match)
    console.log(selectedValues.join("|"));
  }
} else {
  throw `Unknown command ${command}`;
}
