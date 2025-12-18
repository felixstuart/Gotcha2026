# Why use Cloud Functions for Gotcha? 

In the past, the Gotcha cloud architecture has relied heavily on client-side logic to modify Cloud Firestore. Although this system has its merits, issues such as small differences in logic client-to-client can lead to larger headaches. A centralized REST API as the only source interacting with the database prevents any breaks in client logic and may improve performance. 

## Centralize Logic 

At its core, Gotcha isn't a hard concept. There are records for each person, who they have to tag, who has to tag them, and a counter of the number of tags they have. However, an increase in the number of clients creates more room for error when updating complex, interlinked records. Centralizing this logic on the server side reduces the number of places bugs can occur and makes debugging easier. 

## Performance 

In 2025, Gotcha's database calls were incredibly inefficient; the game racked up 2.3 million calls while serving under 700 users. REST APIs, being the backbone of Web2, have experienced numerous optimizations on both the server and client side. Caching, for example, can help reduce repetitive calls when the data is unlikely to update. 

## Security

Getting information out of an iOS app is probably more of a hassle than any Milton Academy student is willing to go through to cheat at Gotcha, but extracting information from the website is much easier. The nature of Firestore queries punishes calls that don't retrieve the entire record. An API can help minimize potential data leaks and reduce cheating. 