USE roundrobin;

-- Remove all non-admin users
DELETE FROM users WHERE role != 'admin';

-- Show remaining users
SELECT * FROM users;