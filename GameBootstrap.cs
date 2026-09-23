using UnityEngine;

namespace BetterQuest3
{
    public class GameBootstrap : MonoBehaviour
    {
        private void Awake()
        {
            Application.targetFrameRate = 72;
            QualitySettings.vSyncCount = 0;
            Physics.defaultSolverIterations = 6;
            Physics.defaultSolverVelocityIterations = 2;
        }

        private void Start()
        {
            SandboxWorld.Create();
        }
    }
}
