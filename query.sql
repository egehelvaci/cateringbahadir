SELECT e.subject, e.body, e.sender, em.type 
FROM emails e 
LEFT JOIN email_metadata em ON e.id = em.emailId 
WHERE em.type IS NOT NULL 
LIMIT 500