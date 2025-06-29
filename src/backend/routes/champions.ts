import { Request, Response, RequestHandler } from 'express';
import { DataDragonService } from '../services/DataDragonService';

export function setupChampionRoutes(app: any, dataDragonService: DataDragonService) {
  console.log('🏆 [setupChampionRoutes] Função chamada - configurando rotas de campeões');

  // Endpoint para obter todos os campeões do DataDragon
  app.get('/api/champions', (async (req: Request, res: Response) => {
    try {
      console.log('🏆 [GET /api/champions] Obtendo dados dos campeões...');
      console.log('🏆 [GET /api/champions] DataDragonService carregado:', dataDragonService.isLoaded());

      // Garantir que os campeões estejam carregados
      if (!dataDragonService.isLoaded()) {
        console.log('🔄 [GET /api/champions] Carregando campeões...');
        await dataDragonService.loadChampions();
        console.log('✅ [GET /api/champions] Campeões carregados com sucesso');
      }

      const champions = dataDragonService.getAllChampions();
      const championsByRole = dataDragonService.getChampionsByRole();

      console.log(`✅ [GET /api/champions] ${champions.length} campeões retornados`);
      console.log('🏆 [GET /api/champions] Primeiros 5 campeões:', champions.slice(0, 5).map(c => c.name));

      res.json({
        success: true,
        champions: champions,
        championsByRole: championsByRole,
        total: champions.length
      });

    } catch (error: any) {
      console.error('❌ [GET /api/champions] Erro:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }) as RequestHandler);

  // Endpoint para obter campeões por role
  app.get('/api/champions/role/:role', (async (req: Request, res: Response) => {
    try {
      const { role } = req.params;
      console.log(`🏆 [GET /api/champions/role/${role}] Obtendo campeões da role...`);

      // Garantir que os campeões estejam carregados
      if (!dataDragonService.isLoaded()) {
        console.log('🔄 [GET /api/champions/role] Carregando campeões...');
        await dataDragonService.loadChampions();
      }

      const championsByRole = dataDragonService.getChampionsByRole();
      const roleChampions = championsByRole[role as keyof typeof championsByRole] || [];

      console.log(`✅ [GET /api/champions/role/${role}] ${roleChampions.length} campeões retornados`);

      res.json({
        success: true,
        champions: roleChampions,
        role: role,
        total: roleChampions.length
      });

    } catch (error: any) {
      console.error('❌ [GET /api/champions/role] Erro:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }) as RequestHandler);
} 