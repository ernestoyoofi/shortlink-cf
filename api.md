# API reference

Info: Bearer token will get from environment set on env.PASSKEY_AUTH

## Create shortlink

Path: /api/link
Method: POST
Authorization: Bearer <token> *(Required)*

Body:
```json
{
  "url": "https://www.google.com", // *(Required)*
  "key": "google-website" // (Optional, if empty, we will generate a random 8 hexadecimal characters)
}
```

Response:
```json
{
  "code": "abcedf", // This code get from key or generate 8 hexa chars
  "created_at": "2022-01-01T00:00:00Z", // ISO8601 datetime
  "updated_at": null // ISO8601 datetime, if null it means the shortlink is not updated yet
}
```

## Update shortlink

Path: /api/link/:code
Method: PUT
Authorization: Bearer <token> *(Required)*

Body:
```json
{
  "url": "https://www.google.com", // *(Required)*
}
```

Response:
```json
{
  "code": "abcedf", // This code get from key or generate 8 hexa chars
  "created_at": "2022-01-01T00:00:00Z", // ISO8601 datetime
  "updated_at": "2022-01-01T00:00:00Z" // ISO8601 datetime
}
```

## Delete shortlink

Path: /api/link/:code
Method: DELETE
Authorization: Bearer <token> *(Required)*

Body:
```json
{
  "url": "https://www.google.com", // *(Required)*
}
```

Response:
```json
{
  "code": "abcedf", // This code get from key or generate 8 hexa chars
  "created_at": "2022-01-01T00:00:00Z", // ISO8601 datetime
  "updated_at": "2022-01-01T00:00:00Z" // ISO8601 datetime
}
```

## List shortlink

Path: /api/links?page=0&limit=20
Method: GET
Authorization: Bearer <token> *(Required)*

Response:
```json
[
  {
    "code": "abcedf", // This code get from key or generate 8 hexa chars
    "url": "https://google.com",
    "created_at": "2022-01-01T00:00:00Z", // ISO8601 datetime
    "updated_at": "2022-01-01T00:00:00Z" // ISO8601 datetime
  },
  {
    "code": "hijklmno", // This code get from key or generate 8 hexa chars
    "url": "https://google.com",
    "created_at": "2022-01-01T00:00:00Z", // ISO8601 datetime
    "updated_at": "2022-01-01T00:00:00Z" // ISO8601 datetime
  }
]
```

## Redirect shortlink

Path: /:code
Method: GET
Redirect: > Check Cache > If Not Found Cache, Read D1 > Found Key? > Redirect (Cacheing)
Not Found: > Show Response (404):
```json
{
  "message": "Link Not Found"
}
```