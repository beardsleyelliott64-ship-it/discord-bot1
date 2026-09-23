using UnityEngine;

namespace BetterQuest3
{
    public class XRReadyPlayer : MonoBehaviour
    {
        [SerializeField] float moveSpeed = 2.2f;
        [SerializeField] float turnSpeed = 60f;

        void Update()
        {
            // Keyboard fallback for Editor testing.
            float h = Input.GetAxis("Horizontal");
            float v = Input.GetAxis("Vertical");

            transform.position += transform.forward * (v * moveSpeed * Time.deltaTime);
            transform.Rotate(0, h * turnSpeed * Time.deltaTime, 0);
        }
    }
}
