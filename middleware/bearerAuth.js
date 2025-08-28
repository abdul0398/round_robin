// Bearer token authentication middleware for webhook endpoints
const requireBearerToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        return res.status(401).json({ 
            error: 'Authorization header is required',
            message: 'Please provide a Bearer token in the Authorization header'
        });
    }
    
    if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ 
            error: 'Invalid authorization format',
            message: 'Authorization header must be in format: Bearer <token>'
        });
    }
    
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Check if token is provided
    if (!token) {
        return res.status(401).json({ 
            error: 'Bearer token is required',
            message: 'Please provide a valid Bearer token'
        });
    }
    
    // Get the expected token from environment variables
    const expectedToken = process.env.WEBHOOK_BEARER_TOKEN;
    
    if (!expectedToken) {
        console.error('WEBHOOK_BEARER_TOKEN environment variable is not set');
        return res.status(500).json({ 
            error: 'Server configuration error',
            message: 'Webhook authentication is not properly configured'
        });
    }
    
    // Verify the token
    if (token !== expectedToken) {
        return res.status(403).json({ 
            error: 'Invalid Bearer token',
            message: 'The provided Bearer token is not valid'
        });
    }
    
    // Token is valid, proceed to the next middleware
    next();
};

module.exports = {
    requireBearerToken
};