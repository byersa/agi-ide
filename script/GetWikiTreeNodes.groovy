import org.moqui.entity.EntityCondition

List<Map> treeNodes = []
String targetSpace = wikiSpaceId ?: 'AGI_INTENT'

// 1. Normalize the passed artifact path
String rawPath = artifactPath ?: sourceReferenceId ?: ""
String searchToken = rawPath
if (searchToken) {
    // Extract base screen name or sub-path without prefixes/extensions
    searchToken = searchToken.replaceAll(/^component:\/\/[^\/]+\/screen\//, "")
                             .replaceAll(/^component:\/\//, "")
                             .replaceAll(/\.xml$/, "")
                             .replaceAll(/\.qvt\.js$/, "")
                             .trim()
}

// 2. Query WikiPage table
def find = ec.entity.find("moqui.resource.wiki.WikiPage")
    .condition("wikiSpaceId", targetSpace)

if (parentWikiPageId) {
    find.condition("parentWikiPageId", parentWikiPageId)
} else if (searchToken) {
    find.condition("pagePath", EntityCondition.LIKE, "%${searchToken}%")
}

List wikiPages = find.list()

// 3. Fallback: If exact path not matched, load all top-level nodes in this space
if (!wikiPages && !parentWikiPageId) {
    wikiPages = ec.entity.find("moqui.resource.wiki.WikiPage")
        .condition("wikiSpaceId", targetSpace)
        .list()
}

for (def page in wikiPages) {
    String pageContent = ""
    try {
        pageContent = ec.resource.getLocationReference("dbresource://AGI_ROOT/${targetSpace.toLowerCase()}/${page.pagePath}.md").getText() ?: ""
    } catch (Exception e) {}

    treeNodes.add([
        id: page.wikiPageId,
        wikiPageId: page.wikiPageId,
        parentWikiPageId: page.parentWikiPageId,
        label: page.pagePath?.substring(page.pagePath.lastIndexOf('/') + 1) ?: page.pagePath,
        pagePath: page.pagePath,
        content: pageContent,
        publishedVersionName: page.publishedVersionName,
        children: []
    ])
}

context.treeNodes = treeNodes