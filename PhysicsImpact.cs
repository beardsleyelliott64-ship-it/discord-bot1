using UnityEngine;

namespace BetterQuest3
{
    public class PhysicsImpact : MonoBehaviour
    {
        [SerializeField] float multiplier = 1.15f;
        [SerializeField] float maxImpulse = 9f;

        void OnCollisionEnter(Collision c)
        {
            if (c.rigidbody == null || c.contactCount == 0) return;
            float force = Mathf.Clamp(c.relativeVelocity.magnitude * multiplier, 0, maxImpulse);
            var contact = c.GetContact(0);
            c.rigidbody.AddForceAtPosition(
                -contact.normal * force,
                contact.point,
                ForceMode.Impulse);
        }
    }
}
