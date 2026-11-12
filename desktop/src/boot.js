// Motorun (loader.js) kütüphane ve yazı tipi klasörlerini bulabilmesi için kök adres.
// Diğer modüllerden ÖNCE içe aktarılmalı.
globalThis.__LGX_BASE__ = new URL("./", document.baseURI).href;
