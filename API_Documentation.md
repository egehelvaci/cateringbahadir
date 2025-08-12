# Chataring Backend API Documentation

## Base URL
```
https://expressjs-postgres-production-05d5.up.railway.app
```

## Authentication
All protected endpoints require JWT authentication via Authorization header:
```
Authorization: Bearer <jwt_token>
```

## API Endpoints

### 1. Health Check

#### GET /health
Check server health status.

**Request:**
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-08-12T15:02:33.961Z"
}
```

**Status Codes:**
- `200` - Server is healthy

---

### 2. Authentication

#### POST /api/auth/register
Register a new user account.

**Request:**
```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "name": "John Doe",
  "companyName": "Acme Corp"
}
```

**Validation Rules:**
- `email`: Valid email address, normalized
- `password`: Minimum 8 characters
- `name`: Optional, trimmed, non-empty if provided
- `companyName`: Required, trimmed, non-empty

**Response (Success):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "1",
    "email": "user@example.com",
    "name": "John Doe",
    "company": "Acme Corp"
  }
}
```

**Response (Error):**
```json
{
  "status": "error",
  "message": "User already exists"
}
```

**Status Codes:**
- `201` - User created successfully
- `400` - User already exists or validation error
- `429` - Too many requests (rate limited)

#### POST /api/auth/login
Login with existing credentials.

**Request:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

**Validation Rules:**
- `email`: Valid email address, normalized
- `password`: Required, non-empty

**Response (Success):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "1",
    "email": "user@example.com",
    "name": "John Doe",
    "company": "Acme Corp"
  }
}
```

**Response (Error):**
```json
{
  "status": "error",
  "message": "Invalid credentials"
}
```

**Status Codes:**
- `200` - Login successful
- `401` - Invalid credentials
- `429` - Too many requests (rate limited)

---

### 3. Google OAuth & Gmail Integration

#### GET /api/auth/google
Initialize Google OAuth flow for Gmail access.

**Request:**
```http
GET /api/auth/google?state=custom_state
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `state` (optional): Custom state parameter for OAuth flow

**Response:**
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?access_type=offline&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fgmail.readonly&include_granted_scopes=true&state=user_123&prompt=consent&response_type=code&client_id=CLIENT_ID&redirect_uri=REDIRECT_URI",
  "message": "Redirect user to this URL to authorize Gmail access"
}
```

**Status Codes:**
- `200` - OAuth URL generated successfully
- `401` - Authentication required

#### GET /api/oauth2/callback
OAuth callback handler (used by Google after authorization).

**Request:**
```http
GET /api/oauth2/callback?code=AUTH_CODE&state=custom_state
```

**Query Parameters:**
- `code`: Authorization code from Google (required)
- `state`: State parameter from initial request (optional)

**Response (Success):**
```json
{
  "success": true,
  "message": "Gmail account connected successfully",
  "email": "user@gmail.com",
  "name": "User Name",
  "connectedAt": "2025-08-12T15:02:33.961Z"
}
```

**Response (Error):**
```json
{
  "status": "error",
  "message": "Authorization code has expired or is invalid"
}
```

**Status Codes:**
- `200` - Gmail account connected successfully
- `400` - Invalid or expired authorization code
- `500` - Failed to connect Gmail account

#### GET /api/gmail/accounts
List connected Gmail accounts.

**Request:**
```http
GET /api/gmail/accounts
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "accounts": [
    {
      "email": "user@gmail.com",
      "name": "User Name",
      "connectedAt": "2025-08-12T15:02:33.961Z",
      "status": "active"
    }
  ],
  "totalCount": 1
}
```

**Status Codes:**
- `200` - Accounts retrieved successfully
- `401` - Authentication required

#### POST /api/gmail/pull
Pull messages from a specific Gmail account.

**Request:**
```http
POST /api/gmail/pull
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "email": "user@gmail.com"
}
```

**Validation Rules:**
- `email`: Valid Gmail address (required)

**Response:**
```json
{
  "success": true,
  "message": "Gmail messages pulled successfully",
  "email": "user@gmail.com",
  "messageCount": 25,
  "processedAt": "2025-08-12T15:02:33.961Z"
}
```

**Status Codes:**
- `200` - Messages pulled successfully
- `401` - Authentication required
- `404` - Gmail account not found
- `429` - Too many requests (rate limited)

#### POST /api/gmail/pull-all
Pull messages from all connected Gmail accounts.

**Request:**
```http
POST /api/gmail/pull-all
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "success": true,
  "message": "Messages pulled from all Gmail accounts",
  "results": [
    {
      "email": "user1@gmail.com",
      "messageCount": 25,
      "success": true
    },
    {
      "email": "user2@gmail.com",
      "messageCount": 15,
      "success": true
    }
  ],
  "totalAccounts": 2,
  "processedAt": "2025-08-12T15:02:33.961Z"
}
```

**Status Codes:**
- `200` - Messages pulled from all accounts
- `401` - Authentication required
- `404` - No Gmail accounts connected
- `429` - Too many requests (rate limited)

#### DELETE /api/gmail/revoke
Revoke Gmail access for a specific account.

**Request:**
```http
DELETE /api/gmail/revoke
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "email": "user@gmail.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Gmail access revoked successfully",
  "email": "user@gmail.com"
}
```

**Status Codes:**
- `200` - Access revoked successfully
- `401` - Authentication required
- `404` - Gmail account not found

#### GET /api/gmail/status/:email
Get Gmail account connection status.

**Request:**
```http
GET /api/gmail/status/user@gmail.com
Authorization: Bearer <jwt_token>
```

**Response (Connected):**
```json
{
  "email": "user@gmail.com",
  "connected": true,
  "name": "User Name",
  "connectedAt": "2025-08-12T15:02:33.961Z",
  "lastSync": "2025-08-12T15:02:33.961Z",
  "status": "active"
}
```

**Response (Not Connected):**
```json
{
  "email": "user@gmail.com",
  "connected": false,
  "message": "Gmail account not connected"
}
```

**Status Codes:**
- `200` - Status retrieved successfully
- `401` - Authentication required

#### GET /api/gmail/messages/:email
List Gmail messages for a specific account.

**Request:**
```http
GET /api/gmail/messages/user@gmail.com?maxResults=50&labelIds=INBOX&q=subject:important&includeSpamTrash=false
Authorization: Bearer <jwt_token>
```

**Query Parameters:**
- `maxResults` (optional): Maximum number of messages to return (default: 50, max: 500)
- `labelIds` (optional): Comma-separated list of label IDs to filter by
- `q` (optional): Gmail query string for advanced filtering
- `includeSpamTrash` (optional): Include spam and trash messages (default: false)

**Response:**
```json
{
  "messages": [
    {
      "id": "message_id_123",
      "threadId": "thread_id_456",
      "snippet": "Message preview text...",
      "internalDate": "1755010967000",
      "labelIds": ["INBOX", "UNREAD"],
      "headers": {
        "From": "sender@example.com",
        "To": "user@gmail.com",
        "Subject": "Important Message",
        "Date": "Mon, 12 Aug 2025 15:02:33 +0000"
      }
    }
  ],
  "totalCount": 1,
  "email": "user@gmail.com",
  "retrievedAt": "2025-08-12T15:02:33.961Z"
}
```

**Status Codes:**
- `200` - Messages retrieved successfully
- `401` - Authentication required
- `404` - Gmail account not found
- `403` - Gmail access token expired

#### GET /api/gmail/messages/:email/:messageId
Get details of a specific Gmail message.

**Request:**
```http
GET /api/gmail/messages/user@gmail.com/message_id_123
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "id": "message_id_123",
  "threadId": "thread_id_456",
  "snippet": "Full message preview text...",
  "internalDate": "1755010967000",
  "labelIds": ["INBOX", "UNREAD"],
  "headers": {
    "From": "sender@example.com",
    "To": "user@gmail.com",
    "Subject": "Important Message",
    "Date": "Mon, 12 Aug 2025 15:02:33 +0000",
    "Message-ID": "<unique@example.com>"
  },
  "body": {
    "text": "Plain text content of the message...",
    "html": "<html><body>HTML content of the message...</body></html>"
  },
  "attachments": [
    {
      "filename": "document.pdf",
      "mimeType": "application/pdf",
      "size": 1024000,
      "attachmentId": "attachment_id_789"
    }
  ],
  "email": "user@gmail.com",
  "retrievedAt": "2025-08-12T15:02:33.961Z"
}
```

**Status Codes:**
- `200` - Message retrieved successfully
- `401` - Authentication required
- `404` - Gmail account or message not found
- `403` - Gmail access token expired

---

## Error Responses

All error responses follow this format:
```json
{
  "status": "error",
  "message": "Error description"
}
```

### Common Error Status Codes:
- `400` - Bad Request (validation errors, invalid input)
- `401` - Unauthorized (missing or invalid authentication)
- `403` - Forbidden (insufficient permissions, expired tokens)
- `404` - Not Found (resource doesn't exist)
- `429` - Too Many Requests (rate limiting)
- `500` - Internal Server Error (unexpected server error)
- `503` - Service Unavailable (external service issues)

---

## Rate Limiting

### Standard Rate Limits:
- Authentication endpoints: Stricter limits
- Gmail operations: Standard limits
- Other endpoints: Generous limits

Rate limit headers are included in responses:
- `X-RateLimit-Limit`: Request limit per window
- `X-RateLimit-Remaining`: Requests remaining in current window
- `X-RateLimit-Reset`: Time when the rate limit resets

---

## Security Features

### JWT Tokens:
- Default expiration: 7 days
- Contains user ID for authorization
- Must be included in Authorization header for protected routes

### Password Security:
- Minimum 8 characters required
- Passwords are hashed using bcrypt
- Salt rounds: 10

### CORS:
- Configured for secure cross-origin requests
- Credentials support enabled

### Request Validation:
- All inputs validated using express-validator
- SQL injection protection via Prisma ORM
- XSS protection via input sanitization

---

## Environment Configuration

Required environment variables:
```env
DATABASE_URL=postgresql://...
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://your-frontend-domain.com
```

---

## Database Schema

### Users Table:
- `id`: BigInt (Primary Key)
- `email`: String (Unique)
- `password`: String (Hashed)
- `name`: String (Optional)
- `companyId`: BigInt (Foreign Key)
- `createdAt`: DateTime
- `updatedAt`: DateTime

### Companies Table:
- `id`: BigInt (Primary Key)
- `name`: String
- `createdAt`: DateTime
- `updatedAt`: DateTime

### GoogleAccounts Table:
- `id`: BigInt (Primary Key)
- `email`: String (Unique)
- `name`: String
- `accessToken`: String (Encrypted)
- `refreshToken`: String (Encrypted)
- `tokenExpiry`: DateTime
- `createdAt`: DateTime
- `updatedAt`: DateTime

---

## Usage Examples

### Complete Authentication Flow:
```javascript
// 1. Register user
const registerResponse = await fetch('https://expressjs-postgres-production-05d5.up.railway.app/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password123',
    name: 'John Doe',
    companyName: 'Acme Corp'
  })
});
const { token } = await registerResponse.json();

// 2. Initialize Gmail OAuth
const oauthResponse = await fetch('https://expressjs-postgres-production-05d5.up.railway.app/api/auth/google', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { authUrl } = await oauthResponse.json();

// 3. Redirect user to authUrl, then after callback:
const messagesResponse = await fetch('https://expressjs-postgres-production-05d5.up.railway.app/api/gmail/messages/user@gmail.com', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const messages = await messagesResponse.json();
```

### Error Handling:
```javascript
try {
  const response = await fetch('https://expressjs-postgres-production-05d5.up.railway.app/api/gmail/accounts', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message);
  }
  
  const data = await response.json();
  console.log(data);
} catch (error) {
  console.error('API Error:', error.message);
}
```

---

## Support & Contact

For API support and questions, please create an issue in the project repository or contact the development team.

**API Version:** 1.0.0  
**Last Updated:** August 12, 2025