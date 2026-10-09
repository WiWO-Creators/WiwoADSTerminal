-- Amparo (las dos cuentas) tiene el cargo de Director Digital, igual que Franz, 2026-10-07.
UPDATE `users` SET `cargo` = 'Director Digital' WHERE lower(`email`) IN ('amparo@wiwo.me', 'aurrejola@mgcglobalgroup.com');
