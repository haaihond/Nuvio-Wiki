## Nuvio Collections

>[!CAUTION]
>Creating collections should be considered an advanced user feature (seriously this is a warning). If you do not consider yourself an advanced user it is recommend to copy one from [nuvio's community collections](https://nuvio.tv/community-collections)

### Nuvio Collection Structures

Nuvio collections can be confusing. At its core though, it is a file system with folders and subfolders and files in those subfolders (catalogs). Below is a diagram to illustrate this.

```mermaid
graph TD
    %% Collection 1: Mainline Cinema & TV
    subgraph Collection_1 [🎬 Collection 1: Mainline Cinema & TV]
        C1_Root[Main Interface] --> TMDB[TMDB Add-on]
        C1_Root --> Trakt[Trakt Integration]
        
        TMDB --> TMDB_Movies[Trending Movies]
        TMDB --> TMDB_Shows[Popular TV Shows]
        
        Trakt --> Trakt_Watchlist[Personal Watchlist]
        Trakt --> Trakt_Recs[Trakt Recommendations]
        
        TMDB_Movies -.-> Content_Source_1[Debrid / Provider Links]
        TMDB_Shows -.-> Content_Source_1
        Trakt_Watchlist -.-> Content_Source_1
    end

    %% Collection 2: Dedicated Anime Build
    subgraph Collection_2 [⚔️ Collection 2: Dedicated Anime Build]
        C2_Root[Custom Interface] --> Kitsu[Kitsu Add-on]
        C2_Root --> AIO[AIO Metadata Add-on]
        
        Kitsu --> Kitsu_Trending[Trending Anime]
        Kitsu --> Kitsu_Airing[Currently Airing]
        
        AIO --> AIO_Shounen[Custom Shounen Catalog]
        AIO --> AIO_Movies[Anime Feature Films]
        
        Kitsu_Trending -.-> Content_Source_2[Debrid / Nyaa Links]
        Kitsu_Airing -.-> Content_Source_2
        AIO_Shounen -.-> Content_Source_2
    end
    
    %% Styling
    classDef main fill:#2a2a2a,stroke:#333,stroke-width:2px,color:#fff;
    classDef addon fill:#005f73,stroke:#001219,stroke-width:2px,color:#fff;
    classDef category fill:#0a9396,stroke:#001219,stroke-width:2px,color:#fff;
    classDef source fill:#9b2226,stroke:#370617,stroke-width:2px,color:#fff;

    class C1_Root,C2_Root main;
    class TMDB,Trakt,Kitsu,AIO addon;
    class TMDB_Movies,TMDB_Shows,Trakt_Watchlist,Trakt_Recs,Kitsu_Trending,Kitsu_Airing,AIO_Shounen,AIO_Movies category;
    class Content_
