package mx.ideass.personal.agent.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import mx.ideass.personal.agent.app.AppPreferences
import mx.ideass.personal.agent.gateway.client.GatewayConfigSource
import mx.ideass.personal.agent.gateway.session.PersistedSessionProvider
import mx.ideass.personal.agent.gateway.session.SessionProvider
import mx.ideass.personal.agent.network.ChatConnection
import mx.ideass.personal.agent.network.RoutingChatConnection
import mx.ideass.personal.agent.workspace.WorkspaceGateway
import mx.ideass.personal.agent.workspace.WorkspaceHttpClient
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class GatewayModule {
    @Binds
    @Singleton
    abstract fun bindChatConnection(impl: RoutingChatConnection): ChatConnection

    @Binds
    @Singleton
    abstract fun bindSessionProvider(impl: PersistedSessionProvider): SessionProvider

    @Binds
    @Singleton
    abstract fun bindWorkspaceGateway(impl: WorkspaceHttpClient): WorkspaceGateway

    @Binds
    @Singleton
    abstract fun bindGatewayConfigSource(impl: AppPreferences): GatewayConfigSource
}
