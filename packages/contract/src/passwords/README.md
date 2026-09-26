# Common-password blocklist

`common-passwords.ts` contains the complete SecLists `10k-most-common.txt`
list (10,001 entries), converted to a TypeScript array so Metro and Node can
bundle it without filesystem access. Checks use a case-insensitive Set.

- Source: https://github.com/danielmiessler/SecLists/blob/a23e8a413d8facdad2aa8093492f396e19ab64c1/Passwords/Common-Credentials/10k-most-common.txt
- Upstream raw-file SHA-256: `68782d6a4a19a4768d5f15dd66bd534e7a33055cc755411e33f16d18c50fdcce`
- License: MIT, Copyright (c) 2018 Daniel Miessler; full notice in `LICENSE`.
