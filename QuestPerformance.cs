using UnityEngine;

namespace BetterQuest3
{
    public class QuestPerformance : MonoBehaviour
    {
        void Awake()
        {
            Application.targetFrameRate = 72;
            QualitySettings.vSyncCount = 0;
            QualitySettings.shadowDistance = 20f;
            QualitySettings.shadowCascades = 1;
            Physics.defaultSolverIterations = 6;
            Physics.defaultSolverVelocityIterations = 2;
        }
    }
}
