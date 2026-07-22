import org.moqui.entity.EntityCondition

// Fetch all registered tools from the Postgres database tier
def tools = ec.entity.find("agi.ide.mcp.AgiMcpTool").list()
def formattedList = []

tools.each { tool ->
    formattedList.add([
        command: tool.command,
        description: tool.description,
        scope: tool.scope,
        // Pass the raw string format of the executable block safely
        scriptBody: tool.scriptBody
    ])
}
ec.logger.info("In getAllTools, formattedList:" + formattedList)

context.toolsList = formattedList