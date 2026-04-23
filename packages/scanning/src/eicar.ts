/**
 * The EICAR test file — a standards-approved harmless payload that every AV
 * engine flags as malware. Used in tests to prove the scanner wire is alive.
 * https://www.eicar.org/download-anti-malware-testfile/
 */
export const EICAR_TEST_STRING =
  'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
export const EICAR_TEST_BYTES = Buffer.from(EICAR_TEST_STRING, 'ascii');
