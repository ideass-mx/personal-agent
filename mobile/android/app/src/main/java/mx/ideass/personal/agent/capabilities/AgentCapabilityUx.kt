package mx.ideass.personal.agent.capabilities

/**
 * Capa de presentación estática: nombre técnico de tool → copy humano para producto.
 * No duplica policy ni autorización; Gateway sigue siendo la autoridad.
 */
enum class AgentCapabilityCategory(val label: String) {
    Files("Archivos"),
    Pc("PC"),
    Excel("Excel"),
}

data class AgentCapabilityPresentation(
    val toolName: String,
    val label: String,
    val description: String,
    val category: AgentCapabilityCategory,
    val requiresConfirmation: Boolean,
    val platformHint: String? = null,
)

object AgentCapabilityUx {
    private val byToolName: Map<String, AgentCapabilityPresentation> = listOf(
        AgentCapabilityPresentation(
            toolName = "filesystem.search",
            label = "Buscar archivos",
            description = "Permite al agente localizar archivos en tu computadora por nombre, tipo, fecha o contenido.",
            category = AgentCapabilityCategory.Files,
            requiresConfirmation = false,
        ),
        AgentCapabilityPresentation(
            toolName = "filesystem.read",
            label = "Leer archivos",
            description = "Permite al agente consultar el contenido de archivos en tu computadora.",
            category = AgentCapabilityCategory.Files,
            requiresConfirmation = false,
        ),
        AgentCapabilityPresentation(
            toolName = "filesystem.list",
            label = "Explorar archivos",
            description = "Permite al agente consultar carpetas y archivos disponibles.",
            category = AgentCapabilityCategory.Files,
            requiresConfirmation = false,
        ),
        AgentCapabilityPresentation(
            toolName = "filesystem.write",
            label = "Escribir archivos",
            description = "Permite al agente crear o modificar archivos.",
            category = AgentCapabilityCategory.Files,
            requiresConfirmation = true,
        ),
        AgentCapabilityPresentation(
            toolName = "filesystem.delete",
            label = "Eliminar archivos",
            description = "Permite al agente eliminar archivos (siempre con tu confirmación).",
            category = AgentCapabilityCategory.Files,
            requiresConfirmation = true,
        ),
        AgentCapabilityPresentation(
            toolName = "process.execute",
            label = "Ejecutar comandos",
            description = "Permite al agente ejecutar procesos en la PC.",
            category = AgentCapabilityCategory.Pc,
            requiresConfirmation = true,
        ),
        AgentCapabilityPresentation(
            toolName = "office.excel.read",
            label = "Leer Excel",
            description = "Permite consultar información de archivos de Excel.",
            category = AgentCapabilityCategory.Excel,
            requiresConfirmation = false,
            platformHint = "Solo Windows",
        ),
        AgentCapabilityPresentation(
            toolName = "office.excel.write",
            label = "Modificar Excel",
            description = "Permite modificar información de Excel.",
            category = AgentCapabilityCategory.Excel,
            requiresConfirmation = true,
            platformHint = "Solo Windows",
        ),
    ).associateBy { it.toolName }

    private val hiddenToolNames: Set<String> = setOf(
        "agent.echo",
        "math.add",
        "math.subtract",
        "math.multiply",
        "math.divide",
        "diagnostics.ping",
        "system.info",
        "customer.demo",
    )

    fun mvpCapabilities(): List<AgentCapabilityPresentation> =
        byToolName.values.sortedWith(
            compareBy({ it.category.ordinal }, { it.label }),
        )

    fun presentationFor(toolName: String): AgentCapabilityPresentation? =
        byToolName[toolName]

    fun labelFor(toolName: String): String =
        presentationFor(toolName)?.label ?: toolName

    fun isVisibleInProduct(toolName: String): Boolean =
        toolName in byToolName

    fun isHiddenInternalTool(toolName: String): Boolean =
        toolName in hiddenToolNames
}
